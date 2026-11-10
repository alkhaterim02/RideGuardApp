"""Device -> backend HTTPS client. Idempotent via Idempotency-Key.
Video upload: POST upload_url -> PUT file to the signed URL -> POST upload_complete.
Not run against a real backend yet."""
from __future__ import annotations
import json
import logging
import urllib.error
import urllib.request
from typing import Optional

log = logging.getLogger("rideguard.backend")
UPLOAD_KINDS = {"upload_front": "front"}   # the vest has a single front camera


class HttpBackend:
    def __init__(self, base_url: str, device_id: str, secret: str, opener=urllib.request.urlopen, timeout: int = 10):
        if not base_url.startswith("https://"):
            raise ValueError("backend URL must be https")
        self.base, self.device_id, self._secret, self._open, self.timeout = base_url.rstrip("/"), device_id, secret, opener, timeout

    def _post(self, kind: str, payload: dict):
        """Returns (ok, parsed_json_or_None). 409 counts as success (already recorded)."""
        req = urllib.request.Request(
            f"{self.base}/device/{kind}", data=json.dumps(payload).encode(), method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._secret}",
                     "X-Device-Id": self.device_id, "Idempotency-Key": f"{payload.get('incident_id','-')}:{kind}"})
        try:
            with self._open(req, timeout=self.timeout) as r:
                ok = 200 <= r.status < 300
                try:
                    data = json.loads(r.read() or b"{}") if hasattr(r, "read") else None
                except ValueError:
                    data = None
                return ok, data
        except urllib.error.HTTPError as e:
            if e.code == 409:
                return True, None
            log.warning("backend %s -> HTTP %s", kind, e.code)    # never log the token or payload
            return False, None
        except (urllib.error.URLError, TimeoutError, OSError):
            return False, None

    def send(self, kind: str, payload: dict) -> bool:
        if kind in UPLOAD_KINDS:
            return self._upload(UPLOAD_KINDS[kind], payload)
        return self._post(kind, payload)[0]

    def heartbeat(self, status: dict) -> Optional[list]:
        """Returns incident IDs the rider asked (via the app) to cancel, or None if unreachable."""
        ok, data = self._post("heartbeat", {"status": status})
        return (data or {}).get("cancel_requested", []) if ok else None

    def _upload(self, side: str, payload: dict) -> bool:
        iid = payload["incident_id"]
        ok, info = self._post("upload_url", {"incident_id": iid, "side": side})
        if not ok or not info or not info.get("url", "").startswith("https://"):
            return False
        try:
            with open(payload["path"], "rb") as f:
                data = f.read()
        except OSError:
            return False
        put = urllib.request.Request(info["url"], data=data, method="PUT",
                                     headers={"Content-Type": info.get("content_type", "video/mp4")})
        try:
            with self._open(put, timeout=max(self.timeout, 60)) as r:
                if not 200 <= r.status < 300:
                    return False
        except (urllib.error.URLError, TimeoutError, OSError):
            return False
        return self._post("upload_complete", {"incident_id": iid, "side": side})[0]
