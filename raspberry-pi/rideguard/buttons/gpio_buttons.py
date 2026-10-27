"""gpiozero binding for the physical CANCEL and SOS buttons. NOT tested on hardware.
Wiring: button between GPIO pin and GND (internal pull-up). Pins are configurable."""
from rideguard.buttons.debounce import Debouncer


def bind_buttons(orch, cancel_pin: int = 17, sos_pin: int = 27):
    from gpiozero import Button  # only on the Pi
    c, s = Button(cancel_pin, pull_up=True, bounce_time=0.05), Button(sos_pin, pull_up=True, bounce_time=0.05)
    dc, ds = Debouncer(), Debouncer()
    c.when_pressed = lambda: dc.accept() and orch.press_cancel("button")
    s.when_pressed = lambda: ds.accept() and orch.press_sos()
    return c, s
