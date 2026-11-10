# Data model (Firestore + Storage)

One Firebase project serves the Android app, the web dashboard and the vest (through Cloud Functions).
Field names are identical everywhere: Android `model/*.java`, web `src/lib/types.ts`, Functions `lib/policy.js`.
Security is enforced by `backend/firestore.rules` and `backend/storage.rules`; tests are in `backend/rules-tests`.

## Roles

Roles live in `users/{uid}` (not custom claims), so everything works on the free Spark plan.

| role | can |
|---|---|
| `rider` | own profile, own incidents (SOS, test countdown, cancel, false-alarm report, deletion request), own vest status |
| `company_staff` | everything for their company: incidents, riders, vests; acknowledge/close emergencies; approve/add riders |
| `company_admin` | staff rights + company settings, join codes, staff accounts, access log |

Only `status: 'active'` accounts can do anything. Riders who self-register are `pending` until staff approve them.

## Collections

**companies/{companyId}** – `name`, `countdownSeconds` (cancel window, default 20).
Created by `backend/scripts/create_company.js` (or the seed).

**companyCodes/{CODE}** – `companyId`, `companyName`. Riders type the code to register. Fetchable by exact code, never listable.

**users/{uid}** – `name, email, phone, role, companyId, status (pending|active|inactive), riderNumber?, deviceId?, joinCode?, createdAt`.
Users can change only their own name/phone. Staff change riders' `status`, `deviceId`, `riderNumber`.

**riderProfiles/{uid}** – rider-only health data: `fullName, age, bloodType, allergies, conditions, medication, medicalNotes,
emergencyContactName, emergencyContactRelationship, emergencyContactPhone, consentEmergencySharing, consentAt`.
Companies never read this collection directly.

**devices/{deviceId}** – a vest: `companyId, riderId, label, active, lastSeenAt, status{battery, imu, frontCamera, lte, gnss, state}, secretHash`.
`status`/`lastSeenAt` come from the vest heartbeat (Cloud Functions). Online = seen in the last 2 minutes.

**incidents/{INC-XXXXXXXX}**

| field | notes |
|---|---|
| `incidentId, riderId, companyId, deviceId` | owner fields; set at creation, never changed |
| `riderName, riderPhone` | copied at creation for lists |
| `status` | `pending → confirmed → acknowledged → closed`; `pending → cancelled` |
| `trigger` | `auto` (sensor) or `sos` (manual) |
| `source` | `vest` (via Cloud Functions) or `app` (rider's phone) |
| `simulated` | `true` for tests/demo; shown as "Simulation" everywhere |
| `createdAt, confirmedAt, cancelledAt, acknowledgedAt, closedAt` | server timestamps |
| `countdownSeconds` | for `pending`: deadline = `createdAt + countdownSeconds` |
| `latitude, longitude, locationLastKnown, locationUpdatedAt` | emergency location only |
| `peakAccelG, peakRotationDps, tiltDeg, aiVerificationScore, aiAssessment` | sensor/AI summary |
| `smsStatus` | `pending, accepted, delivered, failed, not_sent, simulated, no_vest` |
| `companyNotified` | `dashboard, push_sent, push_failed, not_needed` |
| `frontVideoUploadStatus` | `pending, uploading, uploaded, failed, none` |
| `frontVideoPath` | Storage path, set by the vest upload flow |
| `cancelRequested` | rider asked the vest to cancel (vest decides on next heartbeat) |
| `falseAlarmRequested` | rider reported a false alarm after the alert was sent |
| `deletionRequested` | rider asked for a finished incident to be deleted |
| `acknowledgedBy, closedBy, outcome, closeNote` | company handling; `outcome ∈ rider_safe, help_arrived, hospital, false_alarm, other` |

Who may change what (enforced by rules):
- **Rider (app):** create a `simulated` `pending` countdown or a `confirmed` SOS; cancel a simulated countdown any time;
  confirm it only after the server clock passes the deadline; request a vest cancel; report a false alarm; update location while active;
  request deletion when finished.
- **Staff:** `confirmed → acknowledged` (as themselves), `confirmed/acknowledged → closed` with an outcome.
- **Vest:** everything else, through Cloud Functions.

**incidents/{id}/private/medical** – emergency snapshot copied from `riderProfiles` at confirmation, only if the rider consented.
Staff of the same company can read it while the incident is `confirmed` or `acknowledged`; afterwards only the rider can.

**auditLogs/{auto}** – `action (incident_view, medical_access, video_access, rider_added, rider_updated, device_updated), by, byName, companyId, incidentId?, riderId?, side?, at, detail?`.
Staff append entries as themselves; only admins read them (dashboard → Access log).

## Storage

`incidents/{companyId}/{riderId}/{incidentId}/front_accident_video.mp4` – readable by the rider and by active staff
of that company; nobody writes from a client (the vest uses signed upload URLs from Cloud Functions).

## Indexes

`backend/firestore.indexes.json`: incidents by `companyId + createdAt desc`, by `riderId + createdAt desc`; auditLogs by `companyId + at desc`.
Deploy them with the rules (`firebase deploy --only firestore`).
