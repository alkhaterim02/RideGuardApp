"""Rule-based motion detector. Thresholds are configurable (see docs/ARCHITECTURE.md).

A single reading is never enough: an impact must be corroborated by rotation,
abnormal tilt, or an abnormal stationary state within the evaluation window.
"""
from __future__ import annotations
import math
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Sample:
    t: float            # seconds (monotonic)
    ax: float; ay: float; az: float   # g
    gx: float; gy: float; gz: float   # deg/s


@dataclass
class DetectorConfig:
    impact_g: float = 4.0
    rotation_dps: float = 250.0
    tilt_deg: float = 60.0
    stationary_g_tol: float = 0.15
    stationary_gyro_dps: float = 15.0
    stationary_s: float = 2.0
    window_s: float = 5.0


@dataclass
class Detection:
    peak_g: float
    peak_rotation_dps: float
    tilt_deg: float
    evidence: List[str]


def magnitude(x: float, y: float, z: float) -> float:
    return math.sqrt(x * x + y * y + z * z)


def tilt_degrees(s: Sample) -> float:
    m = magnitude(s.ax, s.ay, s.az)
    if m < 1e-6:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, s.az / m))))


class AccidentDetector:
    def __init__(self, cfg: Optional[DetectorConfig] = None):
        self.cfg = cfg or DetectorConfig()
        self._reset()

    def _reset(self):
        self._impact_t: Optional[float] = None
        self._peak_g = 0.0
        self._peak_rot = 0.0
        self._tilt = 0.0
        self._evidence: set = set()
        self._still_since: Optional[float] = None

    def update(self, s: Sample) -> Optional[Detection]:
        c = self.cfg
        g = magnitude(s.ax, s.ay, s.az)
        rot = magnitude(s.gx, s.gy, s.gz)
        if self._impact_t is None:
            if g >= c.impact_g:
                self._impact_t, self._peak_g = s.t, g
                self._peak_rot, self._tilt = rot, tilt_degrees(s)
                self._check_rot_tilt()
            return self._decide(s.t)
        self._peak_g = max(self._peak_g, g)
        self._peak_rot = max(self._peak_rot, rot)
        if s.t - self._impact_t < c.window_s:
            self._tilt = max(self._tilt, tilt_degrees(s))
        self._check_rot_tilt()
        calm = abs(g - 1.0) <= c.stationary_g_tol and rot <= c.stationary_gyro_dps
        if calm:
            if self._still_since is None:
                self._still_since = s.t
            if s.t - self._still_since >= c.stationary_s:
                self._evidence.add("stationary_after_impact")
        else:
            self._still_since = None
        return self._decide(s.t)

    def _check_rot_tilt(self):
        if self._peak_rot >= self.cfg.rotation_dps:
            self._evidence.add("high_rotation")
        if self._tilt >= self.cfg.tilt_deg:
            self._evidence.add("abnormal_tilt")

    def _decide(self, now: float) -> Optional[Detection]:
        if self._impact_t is None:
            return None
        if self._evidence:
            d = Detection(self._peak_g, self._peak_rot, self._tilt, sorted(self._evidence))
            self._reset()
            return d
        if now - self._impact_t > self.cfg.window_s:
            self._reset()   # lone impact (e.g. pothole): no accident
        return None
