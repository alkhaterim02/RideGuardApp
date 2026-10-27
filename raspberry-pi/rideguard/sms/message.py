"""Emergency SMS composition: single GSM-7 segment (<=160 chars), no medical details."""
from __future__ import annotations
from typing import Optional
from rideguard.location.gnss import Fix

MAX_LEN = 160


def _ascii(s: str) -> str:
    return "".join(ch if 32 <= ord(ch) < 127 and ch not in "^{}\\[]~|" else "?" for ch in s)


def compose_emergency_sms(rider: str, incident_id: str, when: str, fix: Optional[Fix],
                          callback: str = "") -> str:
    if fix:
        tag = " (last known)" if fix.last_known else ""
        loc = f"Loc{tag}: https://maps.google.com/?q={fix.latitude:.5f},{fix.longitude:.5f}"
    else:
        loc = "Location unavailable"
    tail = f" Call: {callback}" if callback else ""
    name = _ascii(rider).strip() or "Rider"
    for limit in range(len(name), 3, -1):          # shrink the name, never the location/ID
        msg = f"RIDEGUARD EMERGENCY: {name[:limit]} possible motorcycle crash. ID {incident_id} {when}. {loc}.{tail}"
        if len(msg) <= MAX_LEN:
            return msg
    return f"RIDEGUARD EMERGENCY ID {incident_id}. {loc}"[:MAX_LEN]
