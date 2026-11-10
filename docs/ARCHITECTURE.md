# Architecture

Three separated components:

- `raspberry-pi/` - vest software (Python). Works without the phone or cloud for SMS.
- `backend/` - Firebase rules + Cloud Functions (trusted operations, tenant isolation).
- `android-app/` - native Java app (Rider and Company roles) on Firebase Auth/Firestore/Storage.
- `web-dashboard/` - React + Vite company dashboard on the same Firebase project. Data model: DATA_MODEL.md.

## Vest state machine
Powered Off -> Starting -> Ready -> Possible Accident -> Countdown -> (Cancelled | Emergency Confirmed) -> Alert Sent -> Video Uploading -> Emergency Active -> Emergency Closed.
Implemented in `raspberry-pi/rideguard/state_machine.py`. Manual SOS goes Ready/Countdown -> Emergency Confirmed. Invalid transitions raise; repeats are no-ops. The countdown is an absolute deadline, so pauses/restarts cannot reset it.

## Detection
`detection/detector.py`: an impact (>= `impact_g`) is only reported as a possible accident when corroborated within `window_s` by high rotation, abnormal tilt, or a stationary state. Lone impacts (potholes) are ignored. Calibrate thresholds with controlled bench tests (shake rig, dummy), never real crashes.

## Emergency priority (enforced by the orchestrator, to be built)
confirm -> best location (label last-known if stale) -> direct SMS -> backend incident sync -> app/company notify -> metadata -> finalize video -> upload front-camera clip -> location updates. SMS never waits on cloud, app, or video.

## Durability
`queue/incident_queue.py`: SQLite jobs keyed by (incident_id, kind); re-enqueue is a no-op; bounded exponential backoff; survives restart.

## Security model (backend/firestore.rules, storage.rules; tested in backend/rules-tests)
Server-enforced company isolation via Firestore/Storage rules and Cloud Functions; no public video URLs; device auth with per-device secrets; audit logs for sensitive access.
