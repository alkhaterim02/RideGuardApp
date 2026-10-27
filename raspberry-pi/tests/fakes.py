"""Scripted transport. SIMULATED - no real modem and never sends a real SMS."""
class Clock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
    def sleep(self, s): self.t += s


class FakeTransport:
    def __init__(self, script):
        self.script, self.out, self.written = script, b"", []   # script: list of (startswith, reply)
    def write(self, data):
        self.written.append(data)
        for prefix, reply in self.script:
            if data.decode("latin1").startswith(prefix):
                self.out += reply.encode(); return
    def read(self):
        o, self.out = self.out, b""
        return o
