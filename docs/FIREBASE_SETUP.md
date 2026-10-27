# Firebase setup

Everything (Android app, web dashboard, vest) uses **one Firebase project**. The free **Spark** plan is enough for the
Android app and dashboard. Cloud Functions (the vest API and emergency push notifications) need the **Blaze** plan.

## 1. Create the project (Firebase console, ~10 min)

1. <https://console.firebase.google.com> → **Add project** (e.g. `rideguard-ai`). Google Analytics is optional.
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** → production mode → a region near you (e.g. `europe-west1`).
4. **Build → Storage → Get started** → production mode, same region.
   (New projects may ask you to upgrade to Blaze for Storage. Without Storage everything works except video playback.)
5. **Project settings → Your apps:**
   - **Android app**: package name `com.rideguard.app` → download `google-services.json` → put it in `android-app/app/`.
   - **Web app**: any nickname → copy the `firebaseConfig` values into `web-dashboard/.env.local`
     (copy `web-dashboard/.env.example` and fill it in; keep `VITE_USE_EMULATORS=0`).

`google-services.json` and `.env.local` are already in `.gitignore`.

## 2. Deploy rules and indexes

```bash
npm install -g firebase-tools
```
```bash
firebase login
```
Then, in `backend/`:
```bash
firebase use --add
```
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 3. Create your company and first administrator

Download a service-account key: **Project settings → Service accounts → Generate new private key** (keep it secret, never commit it).
In `backend/functions` run `npm install` once, then in `backend/` (PowerShell):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\rideguard-key.json"; node scripts/create_company.js --project <project-id> --company swift-deliveries --name "Swift Deliveries" --admin-email you@example.com --admin-name "Your Name" --password "<temporary password>"
```

It prints a **rider join code**. Sign in to the dashboard with the admin email, then add riders (Riders → Add rider) or give
riders the join code so they can register in the app and you approve them.

Optional demo data in the real project (fake riders and incidents on the `@rideguard.test` domain):
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\rideguard-key.json"; $env:SEED_PASSWORD="<choose one>"; node scripts/seed_demo.js --project <project-id>
```

## 4. Run the apps

- Dashboard: `cd web-dashboard`, `npm install`, `npm run dev` → <http://localhost:5173>.
  Publish it with `npm run build`, then `firebase deploy --only hosting` from `backend/` (hosting is configured in `firebase.json`).
- Android: see `docs/ANDROID_SETUP.md`. **Remove** the `rideguard.emulatorHost` line from `android-app/local.properties`
  so the app talks to your project instead of the emulators.

## 5. Cloud Functions (Blaze plan, for the vest and push notifications)

```bash
firebase deploy --only functions
```
- `api` – the vest's HTTPS API (docs/API_CONTRACTS.md). Register a vest in the dashboard, then
  `node scripts/provision_device.js <vest-id> <company-id>` prints the secret for the vest's `.env`.
- `onIncidentWritten` – sends an emergency push to every staff phone of the company (topic `company_<companyId>`).
  Without Blaze the dashboard and Android app still update live while open.
- Signed upload URLs need the Functions service account to have **Service Account Token Creator** on itself.

## Local testing without a project (Firebase Emulator Suite)

Needs Java 11+ (firebase-tools 13) or Java 21+ (firebase-tools 14+). In `backend/`:

```bash
firebase emulators:start --only auth,firestore,storage --project demo-rideguard
```
Seed demo data (second terminal, `backend/`, PowerShell):
```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"; node scripts/seed_demo.js --project demo-rideguard
```
- Dashboard: set `VITE_USE_EMULATORS=1` in `web-dashboard/.env.local`, `npm run dev`, sign in as `admin@rideguard.test` / `RideGuard-Demo-2026`.
- Android emulator: `rideguard.emulatorHost=10.0.2.2` in `android-app/local.properties`, build a debug APK, sign in as `aoife@rideguard.test`.
- Rules tests: `cd backend/rules-tests`, `npm install`, `npm test`.
- Trigger a rider emergency without a phone: `node simulate_rider.js countdown|cancel|sos` (in `backend/rules-tests`).
