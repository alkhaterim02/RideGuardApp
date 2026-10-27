"""Parsing for SIM7600 `AT+CGPSINFO` replies. Verify against your modem firmware."""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Fix:
    latitude: float
    longitude: float
    utc: str = ""
    last_known: bool = False     # set by the caller when reusing an old fix


def _dm_to_deg(value: str, hemi: str, deg_digits: int) -> float:
    deg = int(value[:deg_digits]); minutes = float(value[deg_digits:])
    d = deg + minutes / 60.0
    return -d if hemi in ("S", "W") else d


def parse_cgpsinfo(reply: str) -> Optional[Fix]:
    """Return a Fix, or None when there is no fix (empty fields) or the reply is malformed."""
    m = re.search(r"\+CGPSINFO:\s*([^\r\n]*)", reply)
    if not m:
        return None
    f = [p.strip() for p in m.group(1).split(",")]
    if len(f) < 4 or not f[0] or not f[2]:
        return None
    try:
        if f[1] not in ("N", "S") or f[3] not in ("E", "W"):
            return None
        lat, lon = _dm_to_deg(f[0], f[1], 2), _dm_to_deg(f[2], f[3], 3)
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return Fix(lat, lon, f[5] if len(f) > 5 else "")
