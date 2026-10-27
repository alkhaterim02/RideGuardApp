# RideGuard AI

Motorcycle accident detection vest + **Android app** (riders and companies) + **web dashboard** (companies), on **Firebase**.
University prototype.

| Folder | What | Run |
|---|---|---|
| `android-app/` | Native Java app, rider + company roles | Android Studio → open folder → ▶ (see docs/ANDROID_SETUP.md) |
| `web-dashboard/` | React + Vite company dashboard | `npm install`, `npm run dev` |
| `backend/` | Firestore/Storage rules, indexes, Cloud Functions, admin scripts, rules tests | docs/FIREBASE_SETUP.md |
| `raspberry-pi/` | Vest software (Python, mock hardware) | `python3 -m pytest` |
| `docs/` | Setup, data model, API, demo script, testing | |

**Start here:** docs/HOW_TO_RUN.md (every step, for Windows). Short reference: docs/FIREBASE_SETUP.md (create the project, deploy rules, create your company), then docs/DEMO_GUIDE.md.
Try everything offline first with the Firebase emulators (also in FIREBASE_SETUP.md).

See `PROJECT_STATUS.md` for what is built, tested and still missing.
