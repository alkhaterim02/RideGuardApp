import pytest
from rideguard.state_machine import IncidentStateMachine, State, CancelResult, InvalidTransition


class Clock:
    t = 100.0
    def __call__(self): return self.t


def make(countdown=20):
    c = Clock()
    m = IncidentStateMachine(countdown_s=countdown, clock=c)
    m.power_on()
    return m, c


def test_power_on_reaches_ready():
    m, _ = make()
    assert m.state == State.READY


def test_countdown_expiry_confirms_emergency():
    m, c = make()
    assert m.possible_accident()
    c.t += 19.9
    assert m.tick() == State.COUNTDOWN
    c.t += 0.2
    assert m.tick() == State.EMERGENCY_CONFIRMED


def test_cancel_during_countdown_then_duplicate_cancel():
    m, c = make()
    m.possible_accident()
    c.t += 5
    assert m.cancel() == CancelResult.CANCELLED
    assert m.cancel() == CancelResult.ALREADY_CANCELLED
    assert m.state == State.CANCELLED


def test_cancel_after_deadline_is_too_late():
    m, c = make()
    m.possible_accident()
    c.t += 21
    assert m.cancel() == CancelResult.TOO_LATE
    assert m.state == State.EMERGENCY_CONFIRMED


def test_duplicate_possible_accident_ignored():
    m, c = make()
    assert m.possible_accident()
    first_deadline = m.deadline
    c.t += 3
    assert not m.possible_accident()
    assert m.deadline == first_deadline


def test_remaining_is_deadline_based():
    m, c = make()
    m.possible_accident()
    c.t += 7
    assert m.remaining() == pytest.approx(13)


def test_manual_sos_from_ready_and_during_countdown():
    m, _ = make()
    assert m.manual_sos() and m.state == State.EMERGENCY_CONFIRMED
    m2, _ = make()
    m2.possible_accident()
    assert m2.manual_sos() and m2.state == State.EMERGENCY_CONFIRMED


def test_invalid_transition_rejected():
    m, _ = make()
    with pytest.raises(InvalidTransition):
        m.transition(State.ALERT_SENT)


def test_repeat_transition_is_noop():
    m, _ = make()
    assert m.transition(State.READY) is False


def test_cancelled_returns_to_ready():
    m, _ = make()
    m.possible_accident(); m.cancel()
    assert m.transition(State.READY)
