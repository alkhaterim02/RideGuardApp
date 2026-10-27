"""AI verification contract. AI is advisory only: failure never blocks emergency reporting."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


class AIUnavailable(Exception):
    pass


@dataclass
class AIResult:
    available: bool
    score: Optional[float]      # None unless a real model produced it - never invented
    assessment: str


def safe_verify(verifier, context: dict) -> AIResult:
    if verifier is None:
        return AIResult(False, None, "AI not configured; sensor-only assessment")
    try:
        r = verifier.verify(context)
        if r.score is not None and not (0.0 <= r.score <= 1.0):
            raise ValueError("score out of range")
        return r
    except Exception as e:  # any failure -> sensor-only fallback
        return AIResult(False, None, f"AI failed ({type(e).__name__}); sensor-only assessment")
