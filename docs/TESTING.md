# Testing

| What | Command | Needs |
|---|---|---|
| Vest software (Python) | `cd raspberry-pi`, `python3 -m pytest` | Python 3 |
| Cloud Functions logic | `cd backend/functions`, `npm install`, `npm test` | Node 22+ |
| **Security rules** (Firestore + Storage) | `cd backend/rules-tests`, `npm install`, `npm test` | emulators running |
| Rider flows against real rules | `cd backend/rules-tests`, `node simulate_rider.js countdown\|cancel\|sos` | emulators + seed |
| Web dashboard type-check + build | `cd web-dashboard`, `npm run build` | Node |
| Android unit tests | `cd android-app`, `gradlew testDebugUnitTest` | JDK 17+, Android SDK |
| Android build | `cd android-app`, `gradlew assembleDebug` | JDK 17+, Android SDK |

Start the emulators first for the rules tests (in `backend/`):
`firebase emulators:start --only auth,firestore,storage --project demo-rideguard`

## What the rules tests prove (11 tests)
- Rider self-registration needs a valid join code and starts `pending`; nobody can promote themselves.
- Company isolation: staff of company B cannot read or list company A's incidents, users, vests, videos or health snapshots.
- A pending (unapproved) rider can do nothing.
- Simulated countdowns: cannot be confirmed before the server-side deadline; can be after; can be cancelled.
- Vest incidents: the app may only *request* a cancel; confirmed alerts cannot be cancelled, only reported as false alarms.
- Company acknowledge/close follow the state machine, must be done as yourself, closing needs an outcome.
- Health snapshot: same company, active emergency only; riders' own profiles are never readable by companies.
- Audit log: staff append as themselves only; only admins can read it.
- Join codes: fetch by exact code only, never listed; only admins manage them.
- Storage: videos readable by the rider and the same company only; no client writes.

## Manual test checklist (from the project description, section 23)
Use docs/DEMO_GUIDE.md. App-side items: application cancel button, manual SOS, company notification, health information display,
front/rear video playback (needs uploaded clips: `seed_demo.js --video front.mp4 --rear-video rear.mp4`), location on map,
network loss (airplane mode: Firestore queues writes and syncs when back online).
Hardware items (cameras, MPU-6050, SIM7600 SMS, GNSS, battery) are tested on the vest – see raspberry-pi/.
