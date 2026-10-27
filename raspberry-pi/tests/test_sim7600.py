from rideguard.sms.sim7600 import Sim7600, ModemTimeout, ModemError
from rideguard.location.gnss import parse_cgpsinfo
from rideguard.sms.message import compose_emergency_sms
from rideguard.location.gnss import Fix
from tests.fakes import Clock, FakeTransport

NUM = "+10000000001"   # test number only


def modem(script):
    c = Clock()
    return Sim7600(FakeTransport(script), clock=c, sleep=c.sleep), c


OK = "\r\nOK\r\n"


def test_sms_accepted_with_reference():
    m, _ = modem([("AT+CMGF", OK), ("AT+CMGS", "\r\n> "), ("hello", "\r\n+CMGS: 42\r\n\r\nOK\r\n")])
    r = m.send_sms(NUM, "hello")
    assert (r.status, r.reference) == ("accepted", 42)
    assert m.t.written[-1].endswith(b"\x1a")


def test_sms_failure_cms_error():
    m, _ = modem([("AT+CMGF", OK), ("AT+CMGS", "\r\n> "), ("hello", "\r\n+CMS ERROR: 330\r\n")])
    assert m.send_sms(NUM, "hello").status == "failed"


def test_sms_timeout_is_reported_not_raised():
    m, _ = modem([("AT+CMGF", OK), ("AT+CMGS", "\r\n> ")])   # never answers after text
    r = m.send_sms(NUM, "hello", timeout=5)
    assert r.status == "failed" and "timeout" in r.error


def test_invalid_number_and_long_text_rejected_without_io():
    m, _ = modem([])
    assert m.send_sms("12345", "x").status == "failed"
    assert m.send_sms(NUM, "x" * 161).status == "failed"
    assert m.t.written == []


def test_retry_then_success():
    m, _ = modem([("AT+CMGF", OK), ("AT+CMGS", "\r\n> ")])
    calls = {"n": 0}
    orig = m.send_sms
    def flaky(n, t, timeout=60.0):
        calls["n"] += 1
        from rideguard.sms.sim7600 import SmsResult
        return SmsResult("accepted", 1) if calls["n"] == 3 else SmsResult("failed", error="x")
    m.send_sms = flaky
    assert m.send_sms_with_retry(NUM, "hi", attempts=3).status == "accepted" and calls["n"] == 3


def test_at_error_raises():
    m, _ = modem([("AT+CPIN", "\r\n+CME ERROR: 10\r\n")])
    try:
        m.sim_ready(); assert False
    except ModemError:
        pass


def test_readiness_helpers():
    m, _ = modem([("AT+CPIN", "\r\n+CPIN: READY\r\n\r\nOK\r\n"),
                  ("AT+CREG", "\r\n+CREG: 0,2\r\n\r\nOK\r\n"),
                  ("AT+CEREG", "\r\n+CEREG: 0,1\r\n\r\nOK\r\n"),
                  ("AT+CSQ", "\r\n+CSQ: 99,99\r\n\r\nOK\r\n")])
    assert m.sim_ready() and m.registered() and m.signal_csq() is None


def test_at_timeout():
    m, _ = modem([])
    try:
        m.at("AT", timeout=1); assert False
    except ModemTimeout:
        pass


def test_gnss_parse_fix_and_hemispheres():
    f = parse_cgpsinfo("+CGPSINFO: 3150.7230,N,11711.9310,E,121209,073025.0,40.0,0.0,0.0")
    assert abs(f.latitude - 31.84538) < 1e-4 and abs(f.longitude - 117.19885) < 1e-4
    g = parse_cgpsinfo("+CGPSINFO: 3354.1000,S,01825.5000,W,1,2,3,4,5")
    assert g.latitude < 0 and g.longitude < 0


def test_gnss_no_fix_and_garbage():
    assert parse_cgpsinfo("+CGPSINFO: ,,,,,,,,") is None
    assert parse_cgpsinfo("garbage") is None
    assert parse_cgpsinfo("+CGPSINFO: 9999.0,N,00000.0,E,,,,,") is None
    assert parse_cgpsinfo("+CGPSINFO: abcd,N,00000.0,E,,,,,") is None


def test_sms_fits_one_segment_and_labels_last_known():
    msg = compose_emergency_sms("A" * 80, "INC-0001", "2026-10-11 14:05", Fix(53.34981, -6.26031, last_known=True), "+10000000002")
    assert len(msg) <= 160 and "(last known)" in msg and "INC-0001" in msg and "53.34981,-6.26031" in msg


def test_sms_without_location_and_non_ascii_name():
    msg = compose_emergency_sms("Zoë ^{}", "INC-2", "t", None)
    assert "unavailable" in msg and msg.isascii()
