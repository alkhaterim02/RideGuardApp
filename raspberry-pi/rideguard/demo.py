"""Run:  PYTHONPATH=. python3 -m rideguard.demo [cancel|confirm|sos]
Everything is SIMULATED: no sensors, no modem, no real SMS."""
import sys
from rideguard.detection.detector import AccidentDetector, Sample
from rideguard.location.gnss import Fix
from rideguard.mocks import MockCameras, MockIndicators, MockModem
from rideguard.orchestrator import Config, Orchestrator
from rideguard.queue.incident_queue import IncidentQueue
from rideguard.sensor.imu import SimulatedImu
from rideguard.state_machine import IncidentStateMachine


class SimClock:
    t = 1_800_000_000.0
    def __call__(self): return self.t


def main(scenario="confirm"):
    c = SimClock()
    samples = [Sample(i * 0.05, 0, 0, 1.0, 1, 1, 1) for i in range(10)]
    samples.append(Sample(0.5, 4.2, 0.5, 0.3, 300, 20, 20))        # simulated impact
    samples += [Sample(0.55 + i * 0.05, 0, 0, 1.0, 1, 1, 1) for i in range(50)]
    modem = MockModem(fix=Fix(53.34981, -6.26031))
    o = Orchestrator(SimulatedImu(samples), AccidentDetector(), IncidentStateMachine(20, clock=c), modem,
                     IncidentQueue(), MockIndicators(), MockCameras(),
                     Config("Demo Rider", contacts=["+10000000001"], callback="+10000000002", demo=True), clock=c)
    print("*** DEMO MODE - simulated hardware, no real SMS ***")
    o.start()
    while not o.poll():
        c.t += 0.05
    print("possible accident ->", o.sm.state.name, "| evidence:", o.incident["evidence"])
    for sec in range(1, 31):
        c.t += 1
        if scenario == "cancel" and sec == 5:
            print(f"t+{sec}s cancel pressed ->", o.press_cancel("button").name); break
        if scenario == "sos" and sec == 3:
            print(f"t+{sec}s SOS pressed ->", o.press_sos()); break
        if o.tick().name != "COUNTDOWN":
            break
        print(f"t+{sec}s countdown remaining: {o.sm.remaining():.0f}s")
    print("state:", o.sm.state.name, "| incident status:", o.incident["status"], "| sms_status:", o.incident["sms_status"])
    for n, t in modem.sent:
        print("SIMULATED SMS to", n, "->", t)
    print("queued jobs:", [(i, k) for i, k, _ in o.queue.due_jobs(now=c.t)])
    print("backend sync (simulated ok):", o.drain_queue(lambda k, p: True), "jobs sent")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "confirm")
