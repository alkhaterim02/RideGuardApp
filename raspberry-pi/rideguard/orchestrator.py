"""Ties sensor -> detector -> state machine -> SMS -> durable queue.

Emergency priority: confirm -> best location -> direct SMS -> queue backend sync -> queue video
uploads. The SMS never waits for cloud, app, AI, or video.
"""
from __future__ import annotations
import dataclasses
import datetime as dt
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from rideguard.ai.verifier import safe_verify
from rideguard.detection.detector import AccidentDetector, Detection
from rideguard.location.gnss import Fix
from rideguard.queue.incident_queue import IncidentQueue
from rideguard.sensor.imu import ImuError
from rideguard.sms.message import compose_emergency_sms
from rideguard.state_machine import CancelResult, IncidentStateMachine, State


@dataclass
class Config:
    rider_name: str
    device_id: str = "vest-001"
    contacts: List[str] = field(default_factory=list)   # E.164 numbers
    callback: str = ""
    demo: bool = True


class Orchestrator:
    def __init__(self, imu, detector: AccidentDetector, sm: IncidentStateMachine, modem, queue: IncidentQueue,
                 indicators, cameras, cfg: Config, ai=None, clock: Callable[[], float] = time.time,
                 new_id: Optional[Callable[[], str]] = None):
        if cfg.demo and not getattr(modem, "simulated", False):
            raise RuntimeError("demo mode refuses a real modem (would send real SMS)")
        if not cfg.demo and getattr(modem, "simulated", False):
            raise RuntimeError("simulated modem used outside demo mode")
        self.imu, self.detector, self.sm, self.modem, self.queue = imu, detector, sm, modem, queue
        self.ind, self.cameras, self.cfg, self.ai, self.clock = indicators, cameras, cfg, ai, clock
        self._new_id = new_id or (lambda: "INC-" + uuid.uuid4().hex[:8].upper())
        self.incident: Optional[dict] = None
        self.last_fix: Optional[Fix] = None
        self.imu_fault = False
        self._lock = threading.RLock()

    # ---------- helpers ----------
    def _iso(self) -> str:
        return dt.datetime.fromtimestamp(self.clock(), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def start(self) -> None:
        with self._lock:
            self.sm.power_on()
            self.ind.led("green", True)

    def refresh_location(self) -> None:
        """Call periodically (e.g. every few seconds) so a last-known fix exists."""
        try:
            f = self.modem.gnss_fix()
        except Exception:
            return
        if f:
            self.last_fix = Fix(f.latitude, f.longitude, f.utc, False)

    def _best_fix(self) -> Optional[Fix]:
        try:
            f = self.modem.gnss_fix()
        except Exception:
            f = None
        if f:
            self.last_fix = Fix(f.latitude, f.longitude, f.utc, False)
            return self.last_fix
        if self.last_fix:
            return Fix(self.last_fix.latitude, self.last_fix.longitude, self.last_fix.utc, True)
        return None

    def _new_incident(self, trigger: str, det: Optional[Detection]) -> dict:
        inc = {"incident_id": self._new_id(), "device_id": self.cfg.device_id, "trigger": trigger,
               "created_at": self._iso(), "status": "pending",
               "peak_acceleration_g": det.peak_g if det else None,
               "peak_rotation_dps": det.peak_rotation_dps if det else None,
               "detected_tilt_deg": det.tilt_deg if det else None,
               "evidence": det.evidence if det else [], "sms_status": "pending",
               "camera_faults": [], "demo": self.cfg.demo}
        self.incident = inc
        return inc

    # ---------- inputs ----------
    def poll(self):
        """One sensor step. Returns a Detection if a possible accident started."""
        with self._lock:
            try:
                s = self.imu.read()
            except ImuError:
                self.imu_fault = True      # buttons/SOS keep working without the IMU
                return None
            self.imu_fault = False
            det = self.detector.update(s)
            if det and self.sm.state == State.READY and self._start_possible(det):
                return det
            return None

    def _start_possible(self, det: Detection) -> bool:
        if not self.sm.possible_accident():
            return False
        inc = self._new_incident("sensor", det)
        self.ind.led("green", False); self.ind.led("yellow", True)
        self.ind.buzzer(True); self.ind.motor(True)
        try:
            self.cameras.freeze(inc["incident_id"])
        except Exception:
            inc["camera_faults"].append("freeze_failed")
        ai = safe_verify(self.ai, {"incident_id": inc["incident_id"], "evidence": det.evidence})
        inc["ai"] = dataclasses.asdict(ai)
        self.queue.enqueue(inc["incident_id"], "possible_accident", dict(inc))
        return True

    def press_cancel(self, source: str = "button") -> CancelResult:
        with self._lock:
            res = self.sm.cancel()
            inc = self.incident
            if res == CancelResult.CANCELLED and inc:
                inc.update(status="cancelled", cancelled_by=source, cancelled_at=self._iso())
                self.ind.all_off()
                self.cameras.discard(inc["incident_id"])
                self.queue.enqueue(inc["incident_id"], "incident_cancelled", dict(inc))
                self.sm.transition(State.READY)
                self.ind.led("green", True)
            elif res == CancelResult.TOO_LATE and inc:
                # SMS cannot be recalled: report a follow-up false-alarm request instead
                self.queue.enqueue(inc["incident_id"], "cancel_after_confirm",
                                   {"incident_id": inc["incident_id"], "at": self._iso(), "source": source})
            return res

    def apply_remote_cancels(self, incident_ids) -> Optional[CancelResult]:
        """Heartbeat reply: rider asked (via the app) to cancel. Only the vest can actually cancel."""
        with self._lock:
            if self.incident and self.incident["incident_id"] in (incident_ids or []):
                return self.press_cancel("app")
            return None

    def press_sos(self) -> bool:
        with self._lock:
            if self.sm.state == State.READY:
                self._new_incident("manual_sos", None)
            elif self.sm.state != State.COUNTDOWN:
                return False
            if not self.sm.manual_sos():
                return False
            self.incident["trigger_final"] = "manual_sos"
            self._respond()
            return True

    def tick(self) -> State:
        with self._lock:
            st = self.sm.tick()
            if st == State.EMERGENCY_CONFIRMED and self.incident and not self.incident.get("responded"):
                self._respond()
            return self.sm.state

    # ---------- emergency response ----------
    def _respond(self) -> None:
        inc = self.incident
        inc["responded"] = True
        inc.update(status="confirmed", confirmed_at=self._iso())
        self.ind.led("yellow", False); self.ind.led("red", True)
        self.ind.buzzer(False); self.ind.motor(False)

        fix = self._best_fix()                                       # 2. best location
        if fix:
            inc.update(latitude=fix.latitude, longitude=fix.longitude, location_last_known=fix.last_known,
                       map_link=f"https://maps.google.com/?q={fix.latitude:.5f},{fix.longitude:.5f}")
        else:
            inc.update(latitude=None, longitude=None, location_last_known=None, map_link=None)

        msg = compose_emergency_sms(self.cfg.rider_name, inc["incident_id"], inc["confirmed_at"], fix, self.cfg.callback)
        results = [self.modem.send_sms_with_retry(c, msg) for c in self.cfg.contacts]   # 3. direct SMS first
        ok = any(r.status == "accepted" for r in results)
        inc["sms_status"] = "accepted" if ok else ("no_contacts" if not results else "failed")
        inc["sms_note"] = "accepted by modem/network; delivery not confirmed" if ok else "not sent"

        self.sm.transition(State.ALERT_SENT if ok else State.EMERGENCY_ACTIVE)
        self.queue.enqueue(inc["incident_id"], "create_incident", dict(inc))            # 4. backend sync

        try:                                                                              # 7-9. video
            clips = self.cameras.finish(inc["incident_id"])
        except Exception:
            clips = {}
            inc["camera_faults"].append("finish_failed")
        queued = False
        for side in ("front",):   # single front camera
            if clips.get(side):
                self.queue.enqueue(inc["incident_id"], f"upload_{side}",
                                   {"incident_id": inc["incident_id"], "path": clips[side]})
                queued = True
            else:
                inc["camera_faults"].append(f"{side}_missing")
        if queued:
            self.sm.transition(State.VIDEO_UPLOADING)
        elif self.sm.state != State.EMERGENCY_ACTIVE:
            self.sm.transition(State.EMERGENCY_ACTIVE)

    def mark_closed(self) -> None:
        with self._lock:
            if self.sm.state in (State.EMERGENCY_ACTIVE, State.VIDEO_UPLOADING):
                self.sm.transition(State.EMERGENCY_CLOSED)
                self.ind.all_off()
                self.sm.transition(State.READY)
                self.ind.led("green", True)
                self.incident = None

    # ---------- durable sync ----------
    def drain_queue(self, send: Callable[[str, dict], bool]) -> int:
        done = 0
        for iid, kind, payload in self.queue.due_jobs(now=self.clock()):
            if kind.startswith("upload_") and not self.queue.is_done(iid, "create_incident"):
                continue
            try:
                ok = bool(send(kind, payload))
            except Exception:
                ok = False
            if ok:
                self.queue.mark_done(iid, kind); done += 1
            else:
                self.queue.mark_failed(iid, kind, now=self.clock())
        return done
