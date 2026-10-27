"""SIM7600G-H AT driver: readiness, signal, SMS, GNSS. Transport-injected so it is testable.

IMPORTANT: 'accepted' means the modem returned +CMGS (network accepted the message for
delivery). It is NOT proof the recipient received it. Delivery reports are not enabled here.
"""
from __future__ import annotations
import re
import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Protocol
from rideguard.location.gnss import Fix, parse_cgpsinfo

E164 = re.compile(r"^\+[1-9]\d{6,14}$")


class ModemError(Exception):
    pass


class ModemTimeout(ModemError):
    pass


class Transport(Protocol):
    def write(self, data: bytes) -> None: ...
    def read(self) -> bytes: ...          # non-blocking; b"" when nothing is waiting


class SerialTransport:
    def __init__(self, port: str, baud: int = 115200):
        import serial  # lazy: only needed on the vest
        self._s = serial.Serial(port, baud, timeout=0.05)

    def write(self, data: bytes) -> None:
        self._s.write(data); self._s.flush()

    def read(self) -> bytes:
        return self._s.read(self._s.in_waiting or 1)


@dataclass
class SmsResult:
    status: str                 # "accepted" | "failed"
    reference: Optional[int] = None
    error: str = ""


def _lines(buf: str) -> List[str]:
    return [l.strip() for l in buf.replace("\r", "\n").split("\n") if l.strip()]


class Sim7600:
    def __init__(self, transport: Transport, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep):
        self.t, self._clock, self._sleep = transport, clock, sleep

    def _read_until(self, done: Callable[[str], bool], timeout: float) -> str:
        buf, end = "", self._clock() + timeout
        while True:
            chunk = self.t.read()
            if chunk:
                buf += chunk.decode("ascii", "replace")
                if done(buf):
                    return buf
            elif self._clock() >= end:
                raise ModemTimeout(f"timeout; got {buf!r}")
            else:
                self._sleep(0.01)
            if self._clock() >= end and not done(buf):
                raise ModemTimeout(f"timeout; got {buf!r}")

    @staticmethod
    def _final(buf: str) -> bool:
        return any(l == "OK" or l == "ERROR" or l.startswith(("+CME ERROR", "+CMS ERROR")) for l in _lines(buf))

    def at(self, cmd: str, timeout: float = 5.0) -> str:
        self.t.write((cmd + "\r").encode("ascii"))
        buf = self._read_until(self._final, timeout)
        if any(l == "ERROR" or l.startswith(("+CME ERROR", "+CMS ERROR")) for l in _lines(buf)):
            raise ModemError(f"{cmd}: {buf.strip()}")
        return buf

    # ---- readiness ----
    def sim_ready(self) -> bool:
        return "+CPIN: READY" in self.at("AT+CPIN?")

    def registered(self) -> bool:
        for q in ("AT+CREG?", "AT+CEREG?"):
            m = re.search(r"\+C[E]?REG:\s*\d+,(\d+)", self.at(q))
            if m and m.group(1) in ("1", "5"):
                return True
        return False

    def signal_csq(self) -> Optional[int]:
        m = re.search(r"\+CSQ:\s*(\d+),", self.at("AT+CSQ"))
        v = int(m.group(1)) if m else 99
        return None if v == 99 else v      # 99 = unknown

    # ---- SMS ----
    def send_sms(self, number: str, text: str, timeout: float = 60.0) -> SmsResult:
        if not E164.match(number):
            return SmsResult("failed", error="invalid number (E.164 required)")
        if len(text) > 160 or not text.isascii():
            return SmsResult("failed", error="text must be <=160 ASCII chars")
        try:
            self.at("AT+CMGF=1")
            self.t.write(f'AT+CMGS="{number}"\r'.encode())
            self._read_until(lambda b: ">" in b or "ERROR" in b, 10.0)
            self.t.write(text.encode("ascii") + b"\x1a")
            buf = self._read_until(lambda b: self._final(b), timeout)
        except ModemError as e:
            return SmsResult("failed", error=str(e))
        m = re.search(r"\+CMGS:\s*(\d+)", buf)
        if m and "ERROR" not in buf:
            return SmsResult("accepted", int(m.group(1)))
        return SmsResult("failed", error=buf.strip()[:120])

    def send_sms_with_retry(self, number: str, text: str, attempts: int = 3,
                            backoff: float = 3.0) -> SmsResult:
        res = SmsResult("failed", error="no attempt")
        for i in range(attempts):
            res = self.send_sms(number, text)
            if res.status == "accepted" or "invalid" in res.error or "<=160" in res.error:
                return res
            self._sleep(backoff * (i + 1))
        return res

    # ---- GNSS ----
    def gnss_start(self) -> None:
        self.at("AT+CGPS=1")

    def gnss_fix(self) -> Optional[Fix]:
        return parse_cgpsinfo(self.at("AT+CGPSINFO"))
