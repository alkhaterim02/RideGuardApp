"""SIMULATED hardware for tests/demo. Nothing here talks to a real modem, phone or camera."""
from rideguard.sms.sim7600 import SmsResult, ModemError


class MockModem:
    simulated = True
    def __init__(self, fail=False, fix=None, fix_error=False, on_send=None):
        self.fail, self.fix, self.fix_error, self.on_send, self.sent = fail, fix, fix_error, on_send, []
    def gnss_fix(self):
        if self.fix_error: raise ModemError("simulated GNSS failure")
        return self.fix
    def send_sms_with_retry(self, number, text, attempts=3, backoff=3.0):
        if self.on_send: self.on_send(number, text)
        self.sent.append((number, text))
        return SmsResult("failed", error="simulated failure") if self.fail else SmsResult("accepted", len(self.sent))


class MockIndicators:
    simulated = True
    def __init__(self): self.leds, self.buz, self.mot, self.log = {}, False, False, []
    def led(self, c, on): self.leds[c] = on; self.log.append(("led", c, on))
    def buzzer(self, on): self.buz = on; self.log.append(("buzzer", on))
    def motor(self, on): self.mot = on; self.log.append(("motor", on))
    def all_off(self): self.leds = {}; self.buz = self.mot = False; self.log.append(("all_off",))


class MockCameras:
    simulated = True
    def __init__(self, fail=False): self.fail, self.discarded = fail, []
    def freeze(self, incident_id):
        if self.fail: raise RuntimeError("simulated camera failure")
    def finish(self, incident_id):
        if self.fail: raise RuntimeError("simulated camera failure")
        return {"front": f"/tmp/{incident_id}_front.mp4"}
    def discard(self, incident_id): self.discarded.append(incident_id)
