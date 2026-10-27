"""Rolling pre-event buffer + post-event recorder. Frames are opaque objects (e.g. encoded bytes)."""
from __future__ import annotations
import shutil
from collections import deque


class FrameRing:
    def __init__(self, seconds: float = 10.0):
        self.seconds, self._d = seconds, deque()

    def add(self, t: float, frame) -> None:
        self._d.append((t, frame))
        while self._d and self._d[0][0] < t - self.seconds:
            self._d.popleft()

    def snapshot(self):
        return list(self._d)


class ClipRecorder:
    """Keeps the pre-event frames and appends frames until post_s seconds after t0."""
    def __init__(self, pre_frames, t0: float, post_s: float = 20.0):
        self.t0, self.post_s, self.frames = t0, post_s, list(pre_frames)

    def add(self, t: float, frame) -> bool:
        if t <= self.t0 + self.post_s:
            self.frames.append((t, frame))
            return True
        return False

    def done(self, t: float) -> bool:
        return t >= self.t0 + self.post_s

    def finalize(self, writer):
        return writer(self.frames) if self.frames else None


def enough_disk(path: str, min_mb: int = 500) -> bool:
    return shutil.disk_usage(path).free >= min_mb * 1024 * 1024
