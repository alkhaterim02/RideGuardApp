from rideguard.queue.incident_queue import IncidentQueue


def test_enqueue_is_idempotent(tmp_path):
    q = IncidentQueue(str(tmp_path / "q.sqlite3"))
    assert q.enqueue("inc1", "create", {"a": 1})
    assert not q.enqueue("inc1", "create", {"a": 2})
    assert q.pending_count() == 1


def test_survives_restart(tmp_path):
    p = str(tmp_path / "q.sqlite3")
    IncidentQueue(p).enqueue("inc1", "upload_front", {"f": "x.mp4"})
    job = IncidentQueue(p).next_due(now=0)
    assert job == ("inc1", "upload_front", {"f": "x.mp4"})


def test_backoff_and_bounded_failure():
    q = IncidentQueue()
    q.enqueue("i", "create", {})
    assert q.mark_failed("i", "create", now=1000, max_attempts=3) == "pending"
    assert q.next_due(now=1000) is None
    assert q.next_due(now=5000) is not None
    q.mark_failed("i", "create", now=5000, max_attempts=3)
    assert q.mark_failed("i", "create", now=9000, max_attempts=3) == "failed"
    assert q.pending_count() == 0


def test_done_jobs_not_returned():
    q = IncidentQueue()
    q.enqueue("i", "create", {})
    q.mark_done("i", "create")
    assert q.next_due(now=0) is None
