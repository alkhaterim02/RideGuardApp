"""Explicit incident state machine for the vest.

Countdown uses an absolute deadline (injected monotonic clock), so it is
immune to pauses/restarts of the caller. Repeated events are idempotent.
"""
from __future__ import annotations
import enum
import time
from typing import Callable, Optional


class State(enum.Enum):
    POWERED_OFF = "powered_off"
    STARTING = "starting"
    READY = "ready"
    POSSIBLE_ACCIDENT = "possible_accident"
    COUNTDOWN = "countdown"
    CANCELLED = "cancelled"
    EMERGENCY_CONFIRMED = "emergency_confirmed"
    ALERT_SENT = "alert_sent"
    VIDEO_UPLOADING = "video_uploading"
    EMERGENCY_ACTIVE = "emergency_active"
    EMERGENCY_CLOSED = "emergency_closed"


class CancelResult(enum.Enum):
    CANCELLED = "cancelled"
    ALREADY_CANCELLED = "already_cancelled"
    TOO_LATE = "too_late"      # emergency already confirmed; SMS cannot be recalled
    NOT_PENDING = "not_pending"


class InvalidTransition(Exception):
    pass


S = State
_ALLOWED = {
    S.POWERED_OFF: {S.STARTING},
    S.STARTING: {S.READY, S.POWERED_OFF},
    S.READY: {S.POSSIBLE_ACCIDENT, S.EMERGENCY_CONFIRMED, S.POWERED_OFF},  # READY->CONFIRMED = manual SOS
    S.POSSIBLE_ACCIDENT: {S.COUNTDOWN, S.CANCELLED},
    S.COUNTDOWN: {S.CANCELLED, S.EMERGENCY_CONFIRMED},
    S.CANCELLED: {S.READY},
    S.EMERGENCY_CONFIRMED: {S.ALERT_SENT, S.VIDEO_UPLOADING, S.EMERGENCY_ACTIVE},
    S.ALERT_SENT: {S.VIDEO_UPLOADING, S.EMERGENCY_ACTIVE},
    S.VIDEO_UPLOADING: {S.EMERGENCY_ACTIVE, S.EMERGENCY_CLOSED},
    S.EMERGENCY_ACTIVE: {S.VIDEO_UPLOADING, S.EMERGENCY_CLOSED},
    S.EMERGENCY_CLOSED: {S.READY},
}
_CONFIRMED_OR_LATER = {S.EMERGENCY_CONFIRMED, S.ALERT_SENT, S.VIDEO_UPLOADING,
                       S.EMERGENCY_ACTIVE, S.EMERGENCY_CLOSED}


class IncidentStateMachine:
    def __init__(self, countdown_s: float = 20.0,
                 clock: Callable[[], float] = time.monotonic,
                 on_transition: Optional[Callable[[State, State], None]] = None):
        self.state = S.POWERED_OFF
        self.countdown_s = countdown_s
        self._clock = clock
        self._on_transition = on_transition
        self.deadline: Optional[float] = None

    def transition(self, target: State) -> bool:
        """Move to target. Returns False for a harmless repeat; raises if invalid."""
        if target == self.state:
            return False
        if target not in _ALLOWED[self.state]:
            raise InvalidTransition(f"{self.state.value} -> {target.value}")
        old, self.state = self.state, target
        if self._on_transition:
            self._on_transition(old, target)
        return True

    def power_on(self) -> None:
        self.transition(S.STARTING)
        self.transition(S.READY)

    def possible_accident(self) -> bool:
        """Begin verification + countdown. Ignored unless READY (duplicate-safe)."""
        if self.state != S.READY:
            return False
        self.transition(S.POSSIBLE_ACCIDENT)
        self.deadline = self._clock() + self.countdown_s
        self.transition(S.COUNTDOWN)
        return True

    def remaining(self) -> float:
        if self.state != S.COUNTDOWN or self.deadline is None:
            return 0.0
        return max(0.0, self.deadline - self._clock())

    def tick(self) -> State:
        """Call periodically; confirms the emergency when the deadline passes."""
        if self.state == S.COUNTDOWN and self._clock() >= self.deadline:
            self.transition(S.EMERGENCY_CONFIRMED)
        return self.state

    def cancel(self) -> CancelResult:
        """Physical button, app, or backend cancel. Safe to call repeatedly."""
        self.tick()  # a cancel arriving after the deadline must lose
        if self.state in (S.POSSIBLE_ACCIDENT, S.COUNTDOWN):
            self.transition(S.CANCELLED)
            self.deadline = None
            return CancelResult.CANCELLED
        if self.state == S.CANCELLED:
            return CancelResult.ALREADY_CANCELLED
        if self.state in _CONFIRMED_OR_LATER:
            return CancelResult.TOO_LATE
        return CancelResult.NOT_PENDING

    def manual_sos(self) -> bool:
        """Immediate confirmation, no countdown. Also valid during a countdown."""
        if self.state in (S.READY, S.COUNTDOWN):
            self.transition(S.EMERGENCY_CONFIRMED)
            self.deadline = None
            return True
        return False
