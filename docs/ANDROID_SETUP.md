# Android app

Native Java app (Android Studio), Material 3, ViewBinding, Firebase Auth/Firestore/Storage/Messaging,
osmdroid (OpenStreetMap, no API key) for maps, Media3 ExoPlayer for accident videos. `minSdk 26`, `compileSdk 34`.

## Build

1. Android Studio → **File → Open → `android-app/`**. Let Gradle sync (AGP 8.5.2, Gradle 8.7 wrapper included).
   If Studio offers newer AGP/library versions, accepting is fine but not needed.
2. Choose the backend:
   - **Your Firebase project:** put `google-services.json` in `android-app/app/` and make sure `android-app/local.properties`
     has **no** `rideguard.emulatorHost` line.
   - **Local emulators:** keep `rideguard.emulatorHost=10.0.2.2` (Android emulator) or your PC's LAN IP (real phone on the same Wi-Fi;
     start the emulators with `--host 0.0.0.0` via `firebase.json` if needed). Debug builds allow plain HTTP for this.
3. Run ▶ on an emulator or phone. Command line: `gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
4. Unit tests: `gradlew testDebugUnitTest`.

## Screens (requirement numbers from the project description)

| Screen | Class | Notes |
|---|---|---|
| 13.1 Welcome / role selection | `WelcomeActivity` | Rider login, Company login, Help; auto sign-in if already logged in |
| 13.2 / 14.1 Login | `LoginActivity` | email + password, show-password, forgot password, role checked against `users/{uid}` |
| 13.3 Rider registration | `RegisterActivity` | join code, contact, health details, consent; waits for company approval |
| 13.4 Rider home | `RiderHomeActivity` | vest status in plain words, green/yellow/red/grey state, Start ride, SOS, test countdown, demo-mode switch |
| 13.5 Health profile | `HealthProfileActivity` | blood type, allergies, conditions, medication, emergency contact, consent |
| 13.6 Countdown | `CountdownActivity` | opens automatically for any pending incident; huge Cancel button; tone + vibration; shows over lock screen |
| 13.7 Emergency confirmed | `EmergencyActivity` | SMS / company / video status, map, call or text contact, update location, report false alarm |
| 13.8 Accident history | `IncidentListActivity` | rider's incidents |
| 13.9 / 14.4 Incident details + video | `IncidentDetailActivity`, `VideoActivity` | map + directions, sensor summary, front-camera video (download for riders), deletion request; company: contact + health (audited), call buttons, acknowledge, close with outcome + confirmation |
| 14.2 / 14.3 Company dashboard + active list | `CompanyHomeActivity` | counts, search, active emergencies first in red, vests with problems, in-app alarm for new emergencies |
| 14.5 Rider management | `RidersActivity` | approve/reject registrations, add rider, assign vest, deactivate, reset password, call |
| 14.6 Emergency history | `IncidentListActivity` (staff) | search + filters (confirmed, false alarms, active) |

## How the countdown works

- **Vest incident:** the vest creates a `pending` incident through Cloud Functions; the app opens the countdown. "Cancel" sets
  `cancelRequested` and the vest cancels on its next heartbeat (the vest's physical button is instant). The vest confirms.
- **Test from the app** ("Test: simulate a possible accident"): the app creates a `simulated` pending incident; when time is up it
  confirms it itself. Firestore rules only allow that after the **server** clock passes the deadline.
- **SOS:** creates a `confirmed` incident immediately with the phone's location. With no vest connected the SMS status says so and the
  app offers "Text emergency contact" (opens the SMS app pre-filled; the rider presses send).
- **Demo mode** (switch on the home screen, on by default): alerts are marked as simulations everywhere.

## Notes

- Location is read from the phone only for SOS, tests and "Update location" – never during normal riding.
- Company staff phones subscribe to push topic `company_<companyId>`; pushes need the Blaze plan (Cloud Functions).
  Without it, the company screens still update live and ring while open.
- Login by phone number or rider ID (13.2) is not supported: Firebase email login needs the email, and a lookup table would expose
  riders' emails. Riders use the email their company registered.
