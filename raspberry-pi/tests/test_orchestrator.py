import pytest
from rideguard.detection.detector import AccidentDetector, Sample
from rideguard.location.gnss import Fix
from rideguard.mocks import MockCameras, MockIndicators, MockModem
from rideguard.orchestrator import Config, Orchestrator
from rideguard.queue.incident_queue import IncidentQueue
from rideguard.sensor.imu import SimulatedImu
from rideguard.sms.sim7600 import Sim7600
from rideguard.state_machine import CancelResult, IncidentStateMachine, State
from rideguard.ai.verifier import AIResult

IMPACT = Sample(0, 4.2, 0.5, 0.3, 300, 20, 20)
FIX = Fix(53.34981, -6.26031)


class C:
    t = 1_800_000_000.0
    def __call__(self): return self.t


def build(modem=None, cameras=None, ai=None, contacts=("+10000000001",), queue=None, demo=True):
    c = C()
    modem = modem or MockModem(fix=FIX)
    o = Orchestrator(SimulatedImu([IMPACT] * 5), AccidentDetector(), IncidentStateMachine(20, clock=c), modem,
                     queue or IncidentQueue(), MockIndicators(), cameras or MockCameras(),
                     Config("Test Rider", contacts=list(contacts), demo=demo), ai=ai, clock=c,
                     new_id=lambda: "INC-TEST")
    o.start()
    return o, c, modem


def kinds(o): return [k for _, k, _ in o.queue.due_jobs(now=o.clock() + 1e6)]


def test_cancel_sends_no_sms_and_returns_ready():
    o, c, m = build()
    assert o.poll()
    assert o.sm.state == State.COUNTDOWN and o.ind.leds["yellow"] and o.ind.buz and o.ind.mot
    c.t += 5
    assert o.press_cancel("app") == CancelResult.CANCELLED
    c.t += 30; o.tick()
    assert m.sent == [] and o.sm.state == State.READY
    assert not o.ind.buz and "incident_cancelled" in kinds(o)
    assert o.cameras.discarded == ["INC-TEST"]
    assert o.press_cancel() == CancelResult.NOT_PENDING      # duplicate is harmless


def test_expiry_sends_sms_before_backend_job_is_queued():
    seen = {}
    m = MockModem(fix=FIX)
    o, c, _ = build(modem=m)
    m.on_send = lambda n, t: seen.update(has_create="create_incident" in kinds(o), text=t)
    o.poll(); c.t += 21
    assert o.tick() == State.VIDEO_UPLOADING
    assert seen["has_create"] is False                       # SMS attempted first
    assert "INC-TEST" in seen["text"] and "53.34981" in seen["text"]
    assert o.ind.leds["red"] and o.incident["sms_status"] == "accepted"
    assert {"create_incident", "upload_front", "upload_rear"} <= set(kinds(o))


def test_sms_failure_is_recorded_and_not_claimed():
    o, c, _ = build(modem=MockModem(fail=True, fix=FIX))
    o.poll(); c.t += 21; o.tick()
    assert o.incident["sms_status"] == "failed" and "not sent" in o.incident["sms_note"]
    payload = [p for _, k, p in o.queue.due_jobs(now=c.t + 1e6) if k == "create_incident"][0]
    assert payload["sms_status"] == "failed"


def test_no_contacts_reported():
    o, c, _ = build(contacts=())
    o.poll(); c.t += 21; o.tick()
    assert o.incident["sms_status"] == "no_contacts"


def test_manual_sos_from_ready_skips_countdown():
    o, c, m = build()
    assert o.press_sos() and len(m.sent) == 1 and o.incident["trigger_final"] == "manual_sos"
    assert o.press_sos() is False                            # repeated SOS ignored


def test_cancel_after_confirmation_is_too_late_and_followup_queued():
    o, c, m = build()
    o.poll(); c.t += 21; o.tick()
    assert o.press_cancel("app") == CancelResult.TOO_LATE
    assert len(m.sent) == 1 and "cancel_after_confirm" in kinds(o)


def test_duplicate_detection_during_countdown_ignored():
    o, c, _ = build()
    assert o.poll() and o.poll() is None
    assert kinds(o).count("possible_accident") == 1


def test_ai_failure_does_not_block_emergency():
    class Boom:
        def verify(self, ctx): raise RuntimeError("x")
    o, c, m = build(ai=Boom())
    o.poll(); assert o.incident["ai"]["available"] is False and o.incident["ai"]["score"] is None
    c.t += 21; o.tick(); assert len(m.sent) == 1


def test_ai_real_score_kept():
    class Ok:
        def verify(self, ctx): return AIResult(True, 0.8, "rider down")
    o, c, _ = build(ai=Ok()); o.poll()
    assert o.incident["ai"]["score"] == 0.8


def test_camera_failure_still_sends_sms():
    o, c, m = build(cameras=MockCameras(fail=True))
    o.poll(); c.t += 21; o.tick()
    assert len(m.sent) == 1 and o.incident["sms_status"] == "accepted" and o.sm.state == State.EMERGENCY_ACTIVE
    assert "freeze_failed" in o.incident["camera_faults"] and "finish_failed" in o.incident["camera_faults"]
    assert "upload_front" not in kinds(o)


def test_gnss_failure_uses_last_known_then_none():
    m = MockModem(fix=FIX); o, c, _ = build(modem=m)
    o.refresh_location(); m.fix_error = True
    o.poll(); c.t += 21; o.tick()
    assert o.incident["location_last_known"] is True and "(last known)" in m.sent[0][1]
    o2, c2, m2 = build(modem=MockModem(fix_error=True))
    o2.poll(); c2.t += 21; o2.tick()
    assert o2.incident["latitude"] is None and "unavailable" in m2.sent[0][1]


def test_demo_mode_refuses_real_modem_and_vice_versa():
    class Real(Sim7600):
        def __init__(self): pass
    with pytest.raises(RuntimeError):
        build(modem=Real(), demo=True)
    with pytest.raises(RuntimeError):
        build(modem=MockModem(), demo=False)


def test_imu_fault_does_not_block_sos():
    o, c, m = build()
    o.imu = SimulatedImu([])                    # exhausted -> ImuError
    assert o.poll() is None and o.imu_fault
    assert o.press_sos() and len(m.sent) == 1


def test_queue_drain_ordering_retry_and_restart(tmp_path):
    path = str(tmp_path / "q.sqlite3")
    o, c, _ = build(queue=IncidentQueue(path))
    o.poll(); c.t += 21; o.tick()
    sent = []
    assert o.drain_queue(lambda k, p: False) == 0            # cloud down: nothing lost
    c.t += 10_000                                            # past backoff
    o2, c2, _ = build(queue=IncidentQueue(path))             # simulated restart
    c2.t = c.t
    assert o2.queue.pending_incidents() == ["INC-TEST"]
    n = o2.drain_queue(lambda k, p: sent.append(k) or True)
    assert n >= 3 and sent.index("create_incident") < sent.index("upload_front")


def test_remote_app_cancel_via_heartbeat():
    o, c, m = build(); o.poll()
    assert o.apply_remote_cancels(["INC-OTHER"]) is None and o.sm.state == State.COUNTDOWN
    assert o.apply_remote_cancels(["INC-TEST"]) == CancelResult.CANCELLED
    c.t += 30; o.tick()
    assert m.sent == [] and o.incident["cancelled_by"] == "app"
