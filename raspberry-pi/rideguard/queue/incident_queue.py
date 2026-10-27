"""Durable, idempotent job queue (SQLite). Survives power loss and restarts.

Jobs are keyed by (incident_id, kind); re-enqueueing is a no-op, so retries and
restart recovery cannot create duplicate incidents or duplicate uploads.
"""
from __future__ import annotations
import json
import sqlite3
import time
from typing import Optional, Tuple


class IncidentQueue:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path)
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs(
            incident_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            next_try REAL NOT NULL DEFAULT 0, PRIMARY KEY(incident_id, kind))""")
        self.db.commit()

    def enqueue(self, incident_id: str, kind: str, payload: dict) -> bool:
        cur = self.db.execute("INSERT OR IGNORE INTO jobs(incident_id,kind,payload) VALUES(?,?,?)",
                              (incident_id, kind, json.dumps(payload)))
        self.db.commit()
        return cur.rowcount == 1

    def next_due(self, now: Optional[float] = None) -> Optional[Tuple[str, str, dict]]:
        now = time.time() if now is None else now
        row = self.db.execute("""SELECT incident_id,kind,payload FROM jobs
            WHERE status='pending' AND next_try<=? ORDER BY rowid LIMIT 1""", (now,)).fetchone()
        return (row[0], row[1], json.loads(row[2])) if row else None

    def mark_done(self, incident_id: str, kind: str) -> None:
        self.db.execute("UPDATE jobs SET status='done' WHERE incident_id=? AND kind=?", (incident_id, kind))
        self.db.commit()

    def mark_failed(self, incident_id: str, kind: str, now: Optional[float] = None,
                    max_attempts: int = 8, base_delay: float = 5.0) -> str:
        """Bounded exponential backoff. Returns 'pending' or 'failed'."""
        now = time.time() if now is None else now
        (attempts,) = self.db.execute("SELECT attempts FROM jobs WHERE incident_id=? AND kind=?",
                                      (incident_id, kind)).fetchone()
        attempts += 1
        status = "failed" if attempts >= max_attempts else "pending"
        self.db.execute("UPDATE jobs SET attempts=?, status=?, next_try=? WHERE incident_id=? AND kind=?",
                        (attempts, status, now + min(base_delay * 2 ** attempts, 3600), incident_id, kind))
        self.db.commit()
        return status

    def pending_count(self) -> int:
        return self.db.execute("SELECT COUNT(*) FROM jobs WHERE status='pending'").fetchone()[0]

    def due_jobs(self, now: Optional[float] = None):
        now = time.time() if now is None else now
        rows = self.db.execute("""SELECT incident_id,kind,payload FROM jobs
            WHERE status='pending' AND next_try<=? ORDER BY rowid""", (now,)).fetchall()
        return [(r[0], r[1], json.loads(r[2])) for r in rows]

    def is_done(self, incident_id: str, kind: str) -> bool:
        r = self.db.execute("SELECT status FROM jobs WHERE incident_id=? AND kind=?", (incident_id, kind)).fetchone()
        return bool(r) and r[0] == "done"

    def pending_incidents(self):
        return [r[0] for r in self.db.execute("SELECT DISTINCT incident_id FROM jobs WHERE status='pending'")]
