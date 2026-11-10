# Demo guide

Everything below is a **simulation**: no real SMS is sent, alerts are labelled "Simulation" on every screen.
Use the local emulators (docs/FIREBASE_SETUP.md, "Local testing") or your project with `seed_demo.js` data.

Demo accounts (seed_demo.js): `admin@rideguard.test` (company admin), `dispatch@rideguard.test` (staff),
riders `aoife@`, `marek@`, `daniel@rideguard.test`, pending rider `luca@rideguard.test`.
Emulator password: `RideGuard-Demo-2026` (real project: the `SEED_PASSWORD` you chose). Company join code: `RIDE-DEMO-7Q`.

## Suggested script (about 8 minutes)

Have the **dashboard** open on a laptop (signed in as the admin) and the **Android app** on a phone/emulator (signed in as Aoife).

1. **Dashboard overview** – active emergencies (red, first), counts, vests with problems (Vest 002 camera fault, Vest 003 offline).
2. **Rider home** – vest status in plain words, green "Ready", Start ride. Point out the demo-mode banner.
3. **False alarm** – tap *Test: simulate a possible accident*. Countdown, alarm tone, vibration. Tap **CANCEL ALERT**.
   Dashboard: the incident shows as "Cancelled – false alarm" in history; no alarm rang.
4. **Confirmed accident** – simulate again and let it reach zero. Phone: "Emergency alert sent (simulated)", who was told, map.
   Dashboard: red alarm banner + sound → **Open emergency** → map + directions, emergency contact, blood type and allergies
   (note "viewing is logged"), sensor/AI summary, video status.
5. **Acknowledge** on the dashboard → the rider's phone shows "Your company has seen this and is responding".
6. **Close** → requires an outcome and a confirmation tick. Health details disappear once closed.
7. **Manual SOS** – red SOS button → confirm. Company phone/dashboard rings immediately.
8. **Failure handling** – open INC-DEMO05 in history: SMS failed (no coverage) and a failed video upload, explained in plain words.
9. **Privacy** – Access log (admin) lists every view of health details and videos; riders can request deletion of finished incidents.
10. **Rider management** – approve Luca's registration, assign Vest 003, reset a password.

Without a phone: `cd backend/rules-tests` then `node simulate_rider.js countdown` (or `cancel`, `sos`) plays the rider's side.

## Vest software (no hardware)
`cd raspberry-pi`, then `PYTHONPATH=. python3 -m rideguard.demo cancel|confirm|sos` shows the vest's state machine and SMS-first ordering.
