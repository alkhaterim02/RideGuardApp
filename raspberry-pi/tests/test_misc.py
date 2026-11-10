import json
import urllib.error
import pytest
from rideguard.ai.verifier import AIResult, safe_verify
from rideguard.backend.client import HttpBackend
from rideguard.buttons.debounce import Debouncer
from rideguard.camera.ring_buffer import ClipRecorder, FrameRing


def test_debounce():
    t = [0.0]
    d = Debouncer(0.4, clock=lambda: t[0])
    assert d.accept(); t[0] = 0.1; assert not d.accept(); t[0] = 0.6; assert d.accept()


def test_ring_rotates_and_clip_collects_post_event():
    r = FrameRing(10)
    for i in range(30): r.add(float(i), i)
    assert r.snapshot()[0][0] == 19.0 and len(r.snapshot()) == 11
    rec = ClipRecorder(r.snapshot(), t0=29.0, post_s=20)
    assert rec.add(40.0, "x") and not rec.add(60.0, "y")
    assert not rec.done(48) and rec.done(49)
    assert rec.finalize(lambda f: len(f)) == 12
    assert ClipRecorder([], 0).finalize(len) is None


def test_ai_safe_verify_variants():
    assert safe_verify(None, {}).available is False
    class Bad:
        def verify(self, c): return AIResult(True, 1.7, "x")
    assert safe_verify(Bad(), {}).score is None


class Resp:
    def __init__(self, status): self.status = status
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_backend_idempotency_header_and_statuses():
    seen = {}
    def ok(req, timeout): seen.update(h=dict(req.header_items()), url=req.full_url); return Resp(200)
    b = HttpBackend("https://x.example/api", "vest-1", "s3cret", opener=ok)
    assert b.send("create_incident", {"incident_id": "I1"})
    assert seen["h"]["Idempotency-key"] == "I1:create_incident" and seen["url"].endswith("/device/create_incident")
    def e(code):
        def f(req, timeout): raise urllib.error.HTTPError("u", code, "m", {}, None)
        return f
    assert HttpBackend("https://x", "d", "s", opener=e(409)).send("k", {"incident_id": "I"}) is True
    assert HttpBackend("https://x", "d", "s", opener=e(500)).send("k", {"incident_id": "I"}) is False
    def down(req, timeout): raise urllib.error.URLError("offline")
    assert HttpBackend("https://x", "d", "s", opener=down).send("k", {}) is False


def test_backend_requires_https():
    with pytest.raises(ValueError): HttpBackend("http://x", "d", "s")


class JsonResp(Resp):
    def __init__(self, status, body=b"{}"): super().__init__(status); self._b = body
    def read(self): return self._b


def test_upload_flow_signed_url_then_complete(tmp_path):
    f = tmp_path / "front.mp4"; f.write_bytes(b"VIDEO")
    calls = []
    def op(req, timeout):
        calls.append((req.get_method(), req.full_url, req.data))
        if req.full_url.endswith("/upload_url"):
            return JsonResp(200, b'{"url":"https://signed.example/put","content_type":"video/mp4"}')
        return JsonResp(200)
    b = HttpBackend("https://x.example/api", "vest-1", "s", opener=op)
    assert b.send("upload_front", {"incident_id": "INC-ABC123", "path": str(f)})
    assert [c[1].rsplit("/", 1)[-1] for c in calls] == ["upload_url", "put", "upload_complete"]
    assert calls[1][0] == "PUT" and calls[1][2] == b"VIDEO"


def test_upload_failures_return_false(tmp_path):
    f = tmp_path / "v.mp4"; f.write_bytes(b"V")
    def no_url(req, timeout): return JsonResp(200, b"{}")
    assert HttpBackend("https://x", "d", "s", opener=no_url).send("upload_front", {"incident_id": "I", "path": str(f)}) is False
    def ok_url(req, timeout): return JsonResp(200, b'{"url":"https://s.example/p"}')
    assert HttpBackend("https://x", "d", "s", opener=ok_url).send("upload_front", {"incident_id": "I", "path": str(tmp_path / "missing.mp4")}) is False


def test_heartbeat_returns_cancel_requests_or_none():
    def op(req, timeout): return JsonResp(200, b'{"ok":true,"cancel_requested":["INC-1"]}')
    assert HttpBackend("https://x", "d", "s", opener=op).heartbeat({}) == ["INC-1"]
    def down(req, timeout): raise urllib.error.URLError("offline")
    assert HttpBackend("https://x", "d", "s", opener=down).heartbeat({}) is None
