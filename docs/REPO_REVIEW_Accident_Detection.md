# Repository review: Rakshit1709/Accident_Detection

Reviewed commit `df1bcf6` (single "Initial commit", 2025-12-10). Cloned into an isolated folder outside this repo; nothing was copied from it. Only this one repository was supplied.

## 1. What it contains
6 files: `README.md`, `Setup_instructions.md`, `requirements.txt` (smbus, pyserial) and three **.txt** files holding Python snippets (`Accelerometer.txt`, `GSM.txt`, `accident.txt`). No tests, no git history beyond one commit.

## 2. Claimed vs actually implemented
| README claim | Reality |
|---|---|
| Accident detection (accel + gyro) | Only accelerometer is used; gyro is never read in `accident.txt`. Logic is flawed (see 4). |
| SMS alerts | Minimal AT-command sender with fixed sleeps; no response checking. Targets **SIM800L**, not SIM7600G-H. |
| GPS location (optional) | **Not implemented.** No GPS code anywhere. |
| "Modular Python codebase" | One script with functions; the other two files are fragments. |
| "Tested unit scripts" | **No tests exist.** Two fragments are not even valid Python (`SyntaxError`: stray header lines, broken indentation). |
| Setup runs `code/main_code.py` | That file does not exist. |

## 3. Licence
**No LICENSE file** in the clone. With no licence, default copyright applies and others have no permission to copy or modify it. (The GitHub API licence check was inconclusive from this sandbox.) The MPU-6050 code also closely follows a widely circulated tutorial sample, so provenance is unclear. **Do not copy it into your project**; a university submission could also raise plagiarism concerns.

## 4. Technical problems (verified)
- **False positive at rest:** `accident.txt` normalises each axis by the sum of absolute values and triggers at >0.3. A stationary board (1 g on Z) gives Z = 1.0, so it "detects an accident" on the first loop. Reproduced.
- **Sampling at 1 Hz** (`sleep(1)`): an impact lasts milliseconds and would be missed.
- **Range saturation:** MPU-6050 defaults to +/-2 g; a crash reads as 2 g. The accel range register is never set.
- **Gyro scale mismatch:** `GYRO_CONFIG=24` selects +/-2000 dps (16.4 LSB per dps) but values are divided by 131 (the +/-250 dps scale), so gyro is overstated about 8x.
- **Sign bug:** `value > 32768` should be `>= 32768`.
- **Division by zero** if all three axes read 0.
- **SMS:** does not wait for the `>` prompt or `+CMGS` reply, ignores errors, cannot tell failure from success, hardcoded number, no number validation.
- **Hardware mismatch:** SIM800L (2G, 9600 baud, `/dev/ttyS0`, 4 V supply) vs your SIM7600G-H 4G HAT (USB `ttyUSB2` or UART, different GNSS commands). 2G networks are shut down in many regions.
- One-shot: stops after the first detection. No countdown, cancel, SOS, camera, Firebase, auth, history, dashboard, or Android.
- Security: only a placeholder phone number and no secrets, but it also has no input validation.

## 5. Compatibility with the RideGuard AI spec
| Spec feature | In repo? | Verdict |
|---|---|---|
| MPU-6050 reading | Partly, buggy | Rebuilt |
| Accident detection (multi-signal) | Flawed single threshold | Rebuilt |
| Countdown / cancel / manual SOS | No | Built from scratch |
| State machine, idempotency | No | Built from scratch |
| GNSS | No | Built (SIM7600 `CGPSINFO`) |
| SMS via SIM7600G-H | SIM800L only, unsafe | Rebuilt |
| Dual cameras / buffering / AI | No | Build from scratch |
| Firebase, auth, history, dashboards, Android (Java) | No | Build from scratch |
| Licence permits reuse | No licence | Not reusable |

## 6. Recommendation
- **Reuse verbatim:** nothing (no licence, defects, wrong modem).
- **Adapt:** nothing. Only the general idea (MPU-6050 over I2C, SMS via AT commands) overlaps, and both are standard techniques documented in the datasheet and the modem AT manual.
- **Build from scratch:** everything. Done so far, written independently:
  - `sensor/imu.py` - MPU-6050 driver (200 Hz burst read, +/-16 g, +/-2000 dps, correct scaling and sign handling, WHO_AM_I check) plus a `SimulatedImu` that is flagged `simulated = True`.
  - `sms/sim7600.py` - SIM7600 driver: SIM/network/signal checks, SMS with prompt/`+CMGS` handling, E.164 validation, bounded retries; reports **"accepted" not "delivered"**.
  - `location/gnss.py` - `+CGPSINFO` parser (no-fix and malformed replies return `None`).
  - `sms/message.py` - single-segment emergency SMS, last-known label, no medical details.
  - 38 tests total, all passing (SIM tests use a fake transport; no SMS can be sent, no real numbers are used).

## 7. Impact on RideGuard's design
- The detector's 4 g impact threshold is only meaningful because the driver now sets +/-16 g. Keep that setting.
- Thresholds are still unvalidated starting values; calibrate on a bench rig.
- AT command details (`CGPSINFO` format, `CMGS` timing) are from the SIM7600 AT manual as I know it and **have not been tested on a real modem**. Verify on your firmware.

## 8. Integration plan (next)
1. Orchestrator: IMU -> detector -> state machine -> SMS -> queue (SMS before cloud/video).
2. Mock GPIO/camera/button layers and debounce.
3. Firebase rules + Cloud Functions (Node, testable here).
4. Android Java app (needs Android Studio on your side; the sandbox cannot build it).
