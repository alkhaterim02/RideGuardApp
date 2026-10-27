"""LED / buzzer / vibration-motor control. The motor MUST be switched through a driver
transistor/MOSFET with a flyback diode - never directly from a GPIO pin."""
import logging

log = logging.getLogger("rideguard.indicators")


class ConsoleIndicators:
    simulated = True
    def led(self, color: str, on: bool): log.info("LED %s %s", color, on)
    def buzzer(self, on: bool): log.info("BUZZER %s", on)
    def motor(self, on: bool): log.info("MOTOR %s", on)
    def all_off(self):
        for c in ("green", "yellow", "red"): self.led(c, False)
        self.buzzer(False); self.motor(False)


class GpioZeroIndicators:
    """Hardware binding (not tested on hardware). Pins are BCM numbers."""
    simulated = False
    def __init__(self, green=5, yellow=6, red=13, buzzer=19, motor_driver=26):
        from gpiozero import LED, Buzzer, OutputDevice
        self._led = {"green": LED(green), "yellow": LED(yellow), "red": LED(red)}
        self._buz, self._mot = Buzzer(buzzer), OutputDevice(motor_driver)
    def led(self, color, on): (self._led[color].on if on else self._led[color].off)()
    def buzzer(self, on): (self._buz.on if on else self._buz.off)()
    def motor(self, on): (self._mot.on if on else self._mot.off)()
    def all_off(self):
        for c in self._led.values(): c.off()
        self._buz.off(); self._mot.off()
