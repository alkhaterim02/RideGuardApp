# API contracts

Base URL: `https://REGION-PROJECT.cloudfunctions.net/api` (function `api`). All requests are HTTPS JSON.
Status: logic is unit-tested (in-memory store); not yet deployed. Company/rider endpoints read the role from `users/{uid}` (see docs/DATA_MODEL.md).

## Device endpoints (vest -> backend)
Headers: `X-Device-Id: vest-001`, `Authorization: Bearer <device secret>`, `Idempotency-Key: <incident_id>:<kind>` (informational; the server is idempotent by incident state).
The server takes `riderId` and `companyId` from the device record, never from the payload.

| POST | Body | Result |
|---|---|---|
| `/device/possible_accident` | `incident_id`, optional peaks/location/ai | creates `pending` incident |
| `/device/create_incident` | `incident_id`, `latitude`, `longitude`, `location_last_known`, `sms_status`, `ai{score,assessment}` | `confirmed`; notifies company; snapshots medical info only if rider consented |
| `/device/incident_cancelled` | `incident_id` | `cancelled` (only from `pending`) |
| `/device/heartbeat` | `status{...}` | `{cancel_requested:[incident_id,...]}` - app cancel requests the vest must act on |
| `/device/upload_url` | `incident_id`, `side` (front/rear) | `{url, path, content_type}` signed PUT URL (15 min) |
| `/device/upload_complete` | `incident_id`, `side` | marks video uploaded |

Responses: `200 {ok, changed}`; repeat of an applied event returns `changed:false`.
Errors: `400 invalid:<fields>`, `401 unauthorized`, `403 wrong_device`, `404 not_found`/`unknown_kind`, `409 invalid_transition:<from>-><to>`.
Vest retry rule: retry on network error/5xx with backoff; 409 is treated as success.

Incident status: `pending -> confirmed | cancelled`, `confirmed -> acknowledged | closed`, `acknowledged -> closed`. `cancelled` and `closed` are final.

## Company endpoints (Firebase ID token; role and company come from `users/{uid}`)
| Method / path | Notes |
|---|---|
| `POST /company/incidents/{id}/acknowledge` | audited; notifies |
| `POST /company/incidents/{id}/close` body `{confirm:true}` | `400 confirmation_required` without confirm; audited |
| `GET /incidents/{id}/medical` | company: only confirmed/acknowledged and rider consent; every attempt audited |
| `GET /incidents/{id}/video/{front\|rear}` | 5-minute signed read URL; audited; never public |

Other tenants' incidents return `404` (not `403`) so IDs are not revealed.

## Rider endpoint
`POST /rider/incidents/{id}/cancel` - while `pending`, sets `cancelRequested`; the vest cancels on its next heartbeat (physical button is instant). After confirmation: `409 too_late`, the SMS cannot be recalled, and a `falseAlarmRequested` flag is recorded for follow-up.

## Firestore (summary)
`users`, `devices` (secretHash, riderId, companyId, active), `incidents` (+ private subdoc `incidents/{id}/private/medical`), `riderProfiles/{uid}` (rider-only), `auditLogs`, `notificationLogs`. Clients cannot write incidents; Cloud Storage client writes are denied (signed URLs only).

## Not implemented yet
Rate limiting, device-secret rotation, rider registration/invite flow, deletion-request workflow, retention cleanup, `deviceEvents` collection, SMS delivery-status callbacks.
