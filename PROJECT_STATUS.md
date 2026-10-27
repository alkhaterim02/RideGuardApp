# RideGuard AI – Project Status

_Last updated: 2026-10-21_

Scope agreed: **Android app + web dashboard on Firebase** (Auth, Firestore, Storage). The Raspberry Pi vest code is kept as delivered.

## Built and verified on this machine

| Area | Status | How it was verified |
|---|---|---|
| Firestore + Storage security rules (roles in `users/{uid}`, company isolation, incident state machine, server-clock countdown, health snapshot, audit log) | Done | 11 rules tests (`backend/rules-tests`) pass on the emulator |
| Cloud Functions logic (vest API) – updated for the new role model, emergency snapshot incl. contact | Done | 15 unit tests pass; **not deployed** (needs Blaze) |
| Push notification function `onIncidentWritten` | Written | Not run (needs Blaze + real project) |
| Admin scripts: `create_company.js`, `seed_demo.js`, `provision_device.js` | Done | Seed run against the emulator; others not run against a real project |
| **Web dashboard** (React + Vite + TS): login/forgot password, overview with stats + map + search, active emergencies, emergency details (map, directions, contact + health with access logging, sensors/AI, videos, acknowledge, close with outcome + confirmation), history with filters + CSV, riders (approve, add, assign vest, deactivate, reset password), vests (health, register, retire), settings (company, countdown, join codes, staff), access log, live alarm banner + sound + browser notification | Done | Type-check + production build pass; exercised in a browser against seeded emulators (login, acknowledge, close, approve, add rider, alarm on new emergency) |
| **Android app** (Java): welcome, rider/company login, rider registration with join code, rider home (vest status, Start ride, SOS, test countdown, demo mode), health profile, countdown (tone + vibration, server-checked), emergency screen (status, map, call/text contact, update location, false alarm), history, incident details + video player (save for riders), company dashboard (stats, search, active list, vest problems, in-app alarm), rider management, push service | Done | `assembleDebug` + unit tests pass; run on an Android 13 emulator against the Firebase emulators: rider login, test countdown → confirmed → emergency screen with map; company login → dashboard → acknowledge |

## Not done / needs you
- **Your Firebase project**: create it, add `google-services.json` and `web-dashboard/.env.local`, deploy rules, run `create_company.js` (docs/FIREBASE_SETUP.md). Nothing has been run against a real project yet.
- **Blaze plan** for Cloud Functions (vest API, push notifications). Without it: no vest connection and no push when the app is closed.
- Video playback was not exercised end to end (no sample MP4s); use `seed_demo.js --video front.mp4 --rear-video rear.mp4`.
- Not tested on a physical phone, rider registration and health-profile screens not clicked through on the emulator (their writes are covered by the rules tests).
- Login by phone number / rider ID (13.2) not supported (see docs/ANDROID_SETUP.md).
- Vest hardware work from before is unchanged: real camera capture, `main.py` loop, hardware wiring docs.
- Data retention / deletion workflow: riders can *request* deletion; actual deletion is a manual admin step.

## Decisions
- Roles in Firestore `users/{uid}` instead of custom claims → works on the free plan, dashboard can manage riders without Functions.
- App-originated tests are always `simulated: true` and labelled everywhere; demo mode is on by default in the app.
- Maps: OpenStreetMap (Leaflet on web, osmdroid on Android) – no API key. Directions open Google Maps.
- Videos are downloaded through the SDK (rules checked), never via shareable URLs; every company view of health data or video is logged.
- Android `compileSdk 34` / Firebase BoM 33.1.2 / AGP 8.5.2 (matches the SDK already installed here).
