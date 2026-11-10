# How to run RideGuard – step by step (Windows)

This guide takes you from nothing to a working system: the **web dashboard** in your browser and the **Android app** on a phone
or emulator, both connected to **your own Firebase project**.

There are two ways to run it:

- **Part B – Real Firebase project** (what you will present). Takes about 45–60 minutes the first time.
- **Part C – Local test mode (emulators)**. Runs everything on your PC with fake demo data, with no Firebase account needed.
  Good for practising. Optional.

Do **Part A** first in both cases.

All commands below are typed in **PowerShell** (Start menu → type "PowerShell" → open it).
Lines that start with `cd` move into a folder. Paste one command at a time and press Enter.

---

## Part A – Install the tools (once)

### A1. Node.js (needed for the dashboard and Firebase tools)
1. Check if it is already installed:
   ```powershell
   node --version
   ```
   If it prints `v20` or higher (this PC has v24), skip to A2.
2. Otherwise download the **LTS** installer from <https://nodejs.org>, run it, accept the defaults, then close and reopen PowerShell.

### A2. Firebase command-line tool (CLI)
```powershell
npm install -g firebase-tools@13
```
Check it:
```powershell
firebase --version
```
It should print `13.x`.

> Why version 13? This PC has **Java 19**. Version 13 works with Java 11 or newer. Firebase CLI 14 and newer need Java 21.
> If you later install Java 21 you can use the latest version (`npm install -g firebase-tools`).

### A3. Android Studio (needed to build and run the Android app)
1. Download from <https://developer.android.com/studio> and install with the default options.
2. Open it once. On the welcome screen let it finish downloading SDK components.
   It may find the Android SDK that is already on this PC (`C:\Users\CUTY COMPUTER\AppData\Local\Android\Sdk`) – that is fine.
3. Android Studio includes its own Java, so you do not need to install Java for the app.

### A4. Install the project's dependencies (once)
```powershell
cd "E:\ride gaurd\web-dashboard"
npm install
```
```powershell
cd "E:\ride gaurd\backend\functions"
npm install
```
Each takes a minute or two. Warnings are normal; errors are not.

---

## Part B – Run with your real Firebase project

### B1. Create the Firebase project
1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name: `rideguard-ai` (any name works). Click **Continue**.
4. Google Analytics: you can turn it **off**. Click **Create project**, wait, then **Continue**.
5. Note the **Project ID** shown under the name (e.g. `rideguard-ai-1a2b3`). You will need it many times.
   You can always find it again under ⚙ **Project settings → General → Project ID**.

### B2. Turn on Authentication (logins)
1. Left menu → **Build → Authentication** → **Get started**.
2. Tab **Sign-in method** → click **Email/Password** → switch **Enable** on (the first switch only) → **Save**.

### B3. Create the Firestore database
1. Left menu → **Build → Firestore Database** → **Create database**.
2. Location: choose one near you, e.g. **europe-west1 (Belgium)**. ⚠ This cannot be changed later.
3. Choose **Start in production mode** → **Create**. (Our own security rules replace the default in step B7.)

### B4. Turn on Storage (accident videos) – optional
1. Left menu → **Build → Storage** → **Get started**.
2. If Firebase asks you to **upgrade to the Blaze plan**: new projects need Blaze (pay-as-you-go with a free allowance) for Storage.
   - If you **don't** want to add billing: skip this step. Everything works except video playback.
   - If you upgrade: choose **production mode** and the **same location** as Firestore.

### B5. Register the web dashboard and copy its settings
1. ⚙ **Project settings** (gear icon next to "Project Overview") → **General** tab → scroll to **Your apps**.
2. Click the **web icon `</>`**. App nickname: `dashboard`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. You will see a block like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "rideguard-ai-1a2b3.firebaseapp.com",
     projectId: "rideguard-ai-1a2b3",
     storageBucket: "rideguard-ai-1a2b3.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   Keep this page open.
4. Open the file `E:\ride gaurd\web-dashboard\.env.local` in Notepad (it exists already; if not, copy `.env.example` and rename it).
   Replace **everything** in it with your values (no quotes, no spaces around `=`):
   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=rideguard-ai-1a2b3.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=rideguard-ai-1a2b3
   VITE_FIREBASE_STORAGE_BUCKET=rideguard-ai-1a2b3.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
   VITE_USE_EMULATORS=0
   ```
   ⚠ `VITE_USE_EMULATORS` must be **0** for the real project. Save the file.

### B6. Register the Android app and download `google-services.json`
1. Back in **Project settings → Your apps** → **Add app** → **Android icon**.
2. Android package name: **`com.rideguard.app`** (exactly this). Nickname: `RideGuard`. SHA-1: leave empty. **Register app**.
3. Click **Download google-services.json**.
4. Move the downloaded file to: `E:\ride gaurd\android-app\app\google-services.json`
   (inside the `app` folder, next to `build.gradle`). The name must be exactly `google-services.json`.
5. Skip the remaining console steps ("Add Firebase SDK" etc.) – the project already has them. Click **Continue to console**.
6. Open `E:\ride gaurd\android-app\local.properties` in Notepad and **delete** the line
   `rideguard.emulatorHost=10.0.2.2`. Keep the `sdk.dir=` line. Save.
   (That line makes the app talk to the local emulators instead of your project.)

### B7. Deploy the security rules and indexes
1. Log the Firebase CLI in to your Google account (opens the browser; click **Allow**):
   ```powershell
   firebase login
   ```
2. Connect the `backend` folder to your project:
   ```powershell
   cd "E:\ride gaurd\backend"
   firebase use --add
   ```
   Pick your project with the arrow keys → Enter. Alias: type `default` → Enter.
3. Deploy the Firestore rules and indexes:
   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   You should see **Deploy complete!**
4. Only if you did B4 (Storage):
   ```powershell
   firebase deploy --only storage
   ```
5. Indexes take a few minutes to build. Check under **Firestore Database → Indexes**: all three should show **Enabled** before you continue.

### B8. Create your company and the first administrator
The administrator account is created with a script that uses a **service-account key** (an admin password file).

1. Console → ⚙ **Project settings → Service accounts** tab → **Generate new private key** → **Generate key**. A `.json` file downloads.
2. Move it **outside the project folder**, for example create `C:\keys\` and put it there as `C:\keys\rideguard-key.json`.
   ⚠ Never share this file or put it in the project folder.
3. Run (one line; change the values in `< >`):
   ```powershell
   cd "E:\ride gaurd\backend"
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\rideguard-key.json"; node scripts/create_company.js --project <your-project-id> --company swift-deliveries --name "Swift Deliveries" --admin-email <your-email> --admin-name "<Your Name>" --password "<TempPassword123>"
   ```
   - `--company`: a short id, lowercase letters/digits/dashes.
   - `--password`: at least 8 characters; you can change it later with "Forgot password".
4. The script prints something like:
   ```
   Company "Swift Deliveries" (swift-deliveries) ready.
   Administrator: you@example.com ...
   Rider join code: RIDE-K7PQ-3M
   ```
   **Write down the join code** – riders type it when they register in the app.

**Optional – demo data in your project** (fake riders, vests and past incidents, all on the `@rideguard.test` domain):
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\rideguard-key.json"; $env:SEED_PASSWORD="<choose a password>"; node scripts/seed_demo.js --project <your-project-id>
```
It prints the demo logins (e.g. `admin@rideguard.test`, `aoife@rideguard.test`); all use the password you chose.
Very useful for the presentation (docs/DEMO_GUIDE.md).

### B9. Start the web dashboard
```powershell
cd "E:\ride gaurd\web-dashboard"
npm run dev
```
1. Open <http://localhost:5173> in your browser.
2. Sign in with the admin email and password from B8.
3. Leave this PowerShell window open while you use the dashboard (Ctrl+C stops it).

First things to do in the dashboard:
- **Riders → + Add rider**: create a rider account (name, email, phone, temporary password). Give the rider their email and password.
- **Vests → + Register vest** (e.g. `vest-001`), then assign it to a rider on the **Riders** page.
- **Company settings**: company name, cancel countdown (seconds), new join codes, staff accounts.
- Click **🔔 Enable emergency alerts** at the top so the browser can show notifications.

### B10. Build and run the Android app
1. Android Studio → **File → Open** → select `E:\ride gaurd\android-app` → **OK**. Trust the project if asked.
2. Wait for **Gradle sync** to finish (bottom status bar; the first time downloads libraries for several minutes).
   If Studio offers to upgrade the Android Gradle Plugin, you can click **Don't remind me** – the current versions work.
3. Choose a device (top toolbar):
   - **Emulator:** Device Manager (phone icon on the right) → **Create device** → e.g. Pixel 7 → system image API 33 or 34 → Finish.
   - **Real phone:** on the phone, Settings → About phone → tap **Build number** 7 times → back → Developer options → turn on
     **USB debugging**. Connect by USB and allow the PC. The phone appears in the device list.
4. Press the green **▶ Run** button. The app installs and opens.
5. The welcome screen must **not** show "Test build: connected to the local Firebase emulators".
   If it does, you skipped step B6.6 – remove the line, then **Build → Clean Project** and run again.
6. **Rider login** → sign in with a rider you created (or `aoife@rideguard.test` from the demo data).
   Allow location and notifications when asked.
7. **Company login** (sign out first) → sign in with the admin or a staff account.

Without a USB cable you can also install the APK: **Build → Build App Bundle(s)/APK(s) → Build APK(s)** → **locate** →
copy `app-debug.apk` to the phone and open it (allow "install unknown apps").

### B11. Check that everything is connected (5-minute test)
1. Dashboard open on the PC (signed in as admin). App on the phone signed in as a rider.
2. App: check **Demo mode** is on (home screen, bottom). Tap **Test: simulate a possible accident**.
3. Countdown appears with sound and vibration. Let it reach **0**.
4. Within seconds the dashboard shows a **red alarm banner** "New emergency (simulation)" with a beep.
5. Dashboard → **Open emergency** → map, emergency contact, health info → **Mark acknowledged**.
6. The app's emergency screen now says **"Your company has seen this and is responding."**
7. Dashboard → **Close incident…** → choose an outcome → tick the confirmation → close.
8. Try again but press **CANCEL ALERT** before 0: the incident appears in history as "Cancelled – false alarm" and no alarm rings.

If all of this works, Part B is complete. 🎉

### B12. Optional extras
- **Put the dashboard online** (a public web address instead of localhost):
  ```powershell
  cd "E:\ride gaurd\web-dashboard"
  npm run build
  cd "E:\ride gaurd\backend"
  firebase deploy --only hosting
  ```
  It prints a `https://<project-id>.web.app` address. Hosting is free on the Spark plan.
  If the deploy complains about the `public` folder, copy `web-dashboard\dist` to `backend\public` and change
  `"public": "../web-dashboard/dist"` to `"public": "public"` in `backend\firebase.json`.
- **Cloud Functions** (needed for the real vest and for push notifications when the app is closed) need the **Blaze plan**:
  ```powershell
  cd "E:\ride gaurd\backend"
  firebase deploy --only functions
  ```
  Then register a vest in the dashboard and give it its secret:
  `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\rideguard-key.json"; node scripts/provision_device.js vest-001 <company-id>`
  (copy the printed lines into the vest's `.env` file).
- **Accident video for the demo:** have one short `.mp4` file and run the seed with
  `--video C:\path\front.mp4` (needs Storage, step B4).

---

## Part C – Local test mode (no Firebase project, optional)

Everything runs on your PC with fake data. Data is **deleted when you stop the emulators**.
You need **three PowerShell windows**.

**Window 1 – start the Firebase emulators** (needs Java; this PC has Java 19):
```powershell
cd "E:\ride gaurd\backend"
firebase emulators:start --only auth,firestore,storage --project demo-rideguard
```
Wait for **"All emulators ready!"**. Leave it open. (Emulator UI to look at the data: <http://127.0.0.1:4000>.)

**Window 2 – load the demo data** (run again every time you restart the emulators):
```powershell
cd "E:\ride gaurd\backend"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"; node scripts/seed_demo.js --project demo-rideguard
```

**Window 3 – the dashboard:**
1. In `web-dashboard\.env.local` set `VITE_USE_EMULATORS=1` (the other lines can stay).
2. Run:
   ```powershell
   cd "E:\ride gaurd\web-dashboard"
   npm run dev
   ```
3. Open <http://localhost:5173> → sign in as **admin@rideguard.test** / **RideGuard-Demo-2026**.

**Android app against the emulators:**
1. In `android-app\local.properties` add the line `rideguard.emulatorHost=10.0.2.2`.
2. Temporarily rename `android-app\app\google-services.json` to `google-services.json.off` (if you have one).
3. Run the app on an **Android emulator** from Android Studio (10.0.2.2 means "the PC" from inside the emulator).
   The welcome screen shows "Test build: connected to the local Firebase emulators".
4. Rider: **aoife@rideguard.test**, company staff: **dispatch@rideguard.test**, password **RideGuard-Demo-2026**.

**Trigger an emergency without a phone** (another window):
```powershell
cd "E:\ride gaurd\backend\rules-tests"
npm install
node simulate_rider.js countdown
```
(`cancel` and `sos` also work.)

**Switching back to your real project:** set `VITE_USE_EMULATORS=0`, remove the `rideguard.emulatorHost` line,
rename `google-services.json.off` back, then rebuild the app.

---

## Problems and fixes

| Problem | Fix |
|---|---|
| Dashboard says **"Firebase is not configured yet"** | `.env.local` is missing or empty, or you didn't restart `npm run dev` after editing it. |
| Dashboard login: **"Email or password is incorrect"** | Check the account exists under Console → Authentication → Users. In local mode, did you run the seed (Window 2)? |
| Dashboard: **"This account has no RideGuard profile"** | The user was created in the console by hand. Create accounts with `create_company.js` or the dashboard's **Add rider / Add staff**. |
| Dashboard: **"This is a rider account"** | Riders use the Android app; the dashboard is for company staff. |
| Error mentioning **"requires an index"** or lists stay empty | Indexes are still building (B7.5) or weren't deployed – run the deploy again and wait. |
| **"permission denied"** everywhere | Rules not deployed (B7.3), or the account's status isn't `active` (approve it on the Riders page). |
| App login: **"waiting for your company to approve"** | The rider registered with a join code: approve them in dashboard → Riders → Awaiting approval. |
| App welcome shows **"Firebase is not configured"** | `google-services.json` missing from `android-app\app\` and no emulator line in `local.properties`. |
| App can't sign in, spinner forever | Real project: remove `rideguard.emulatorHost` (B6.6) and **Build → Clean Project**. Local mode: are the emulators running? |
| Gradle error **"File google-services.json is missing"** or package mismatch | The Android app in the console must use package `com.rideguard.app` exactly. Re-download the file. |
| `firebase` is not recognised | Close and reopen PowerShell after A2, or run `npm install -g firebase-tools@13` again. |
| PowerShell: **"running scripts is disabled"** | Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and answer Y. |
| Emulators: **"no longer supports Java version before 21"** | You installed the newest CLI. Run `npm install -g firebase-tools@13`. |
| Map is blank | The phone/PC needs internet (maps come from OpenStreetMap). |
| Videos say "Waiting for upload" | Normal without the real vest or demo video files (B12). |

## What runs where (summary)

| Piece | Where it runs | Needs |
|---|---|---|
| Web dashboard | your browser (`npm run dev`, or Firebase Hosting) | `.env.local` |
| Android app | phone or emulator (Android Studio) | `google-services.json` |
| Login, database, rules | Firebase (Spark free plan is enough) | steps B2, B3, B7 |
| Videos | Firebase Storage | Blaze plan (B4) |
| Vest API + push notifications | Cloud Functions | Blaze plan (B12) |

More detail: `docs/FIREBASE_SETUP.md` (short reference), `docs/DEMO_GUIDE.md` (presentation script),
`docs/ANDROID_SETUP.md` (screens), `docs/DATA_MODEL.md` (database fields).
