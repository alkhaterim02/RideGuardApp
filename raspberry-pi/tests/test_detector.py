from rideguard.detection.detector import AccidentDetector, Sample


def calm(t): return Sample(t, 0, 0, 1.0, 1, 1, 1)


def run(samples):
    d = AccidentDetector()
    return [r for r in (d.update(s) for s in samples) if r]


def test_normal_riding_no_detection():
    assert run([calm(i * 0.1) for i in range(100)]) == []


def test_lone_impact_pothole_ignored():
    s = [calm(0), Sample(0.1, 0, 0, 5.0, 10, 10, 10)]
    s += [Sample(0.2 + i * 0.1, 0, 0, 1.4 + (i % 2) * 0.5, 40, 40, 40) for i in range(80)]
    assert run(s) == []


def test_impact_with_high_rotation_detected():
    res = run([calm(0), Sample(0.1, 4, 3, 2, 300, 100, 50)])
    assert len(res) == 1 and "high_rotation" in res[0].evidence
    assert res[0].peak_g >= 4.0


def test_impact_then_stationary_detected():
    s = [Sample(0.0, 0, 0, 5.0, 10, 10, 10)]
    s += [Sample(0.1 + i * 0.1, 0.02, 0.0, 1.0, 2, 2, 2) for i in range(40)]
    res = run(s)
    assert len(res) == 1 and "stationary_after_impact" in res[0].evidence


def test_impact_with_bike_on_side_tilt_detected():
    res = run([Sample(0, 4.2, 0.5, 0.3, 20, 20, 20)])
    assert len(res) == 1 and "abnormal_tilt" in res[0].evidence
