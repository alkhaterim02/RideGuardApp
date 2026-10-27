import time


class Debouncer:
    """Ignores presses closer together than min_interval (contact bounce / repeated presses)."""
    def __init__(self, min_interval: float = 0.4, clock=time.monotonic):
        self.min_interval, self._clock, self._last = min_interval, clock, None

    def accept(self) -> bool:
        now = self._clock()
        if self._last is not None and now - self._last < self.min_interval:
            return False
        self._last = now
        return True
