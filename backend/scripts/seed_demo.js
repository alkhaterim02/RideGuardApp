'use strict';
// firebase-admin is installed in functions/ (cd backend/functions && npm install).
const adminRequire = require('node:module').createRequire(require.resolve('../functions/package.json'));
// Seeds a demo company with staff, riders, vests and incidents. Safe to re-run (fixed IDs, overwrites).
//
// Emulator:  set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099, FIRESTORE_EMULATOR_HOST=127.0.0.1:8080,
//            FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199, then: node scripts/seed_demo.js --project demo-rideguard
// Real project: set GOOGLE_APPLICATION_CREDENTIALS=<service-account key.json> and SEED_PASSWORD=<a password you choose>,
//            then: node scripts/seed_demo.js --project <your-project-id> [--bucket <bucket>] [--video front.mp4]
//
// All accounts below are demo accounts on the @rideguard.test domain (never real people).
const fs = require('node:fs');
const { initializeApp } = adminRequire('firebase-admin/app');
const { getAuth } = adminRequire('firebase-admin/auth');
const { getFirestore, Timestamp } = adminRequire('firebase-admin/firestore');
const { getStorage } = adminRequire('firebase-admin/storage');

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const projectId = arg('--project');
if (!projectId) { console.error('usage: seed_demo.js --project <project-id> [--video front.mp4]'); process.exit(1); }
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const password = process.env.SEED_PASSWORD || (emulator ? 'RideGuard-Demo-2026' : null);
if (!password) { console.error('Set SEED_PASSWORD when seeding a real project.'); process.exit(1); }

initializeApp({ projectId, storageBucket: arg('--bucket') || `${projectId}.firebasestorage.app` });
const auth = getAuth();
const db = getFirestore();

const COMPANY = 'demo-co';
const JOIN_CODE = 'RIDE-DEMO-7Q';
const ago = (min) => Timestamp.fromMillis(Date.now() - min * 60000);

const USERS = [
  { key: 'admin', email: 'admin@rideguard.test', name: 'Sarah Kelly', role: 'company_admin', phone: '+353 1 555 0100' },
  { key: 'staff', email: 'dispatch@rideguard.test', name: 'Tom Byrne', role: 'company_staff', phone: '+353 1 555 0101' },
  { key: 'r1', email: 'aoife@rideguard.test', name: 'Aoife Brennan', role: 'rider', phone: '+353 87 555 0111', riderNumber: 'R-1001', deviceId: 'vest-001' },
  { key: 'r2', email: 'marek@rideguard.test', name: 'Marek Nowak', role: 'rider', phone: '+353 87 555 0112', riderNumber: 'R-1002', deviceId: 'vest-002' },
  { key: 'r3', email: 'daniel@rideguard.test', name: 'Daniel Okafor', role: 'rider', phone: '+353 87 555 0113', riderNumber: 'R-1003', deviceId: null },
  { key: 'r4', email: 'luca@rideguard.test', name: 'Luca Moretti', role: 'rider', phone: '+353 87 555 0114', status: 'pending', joinCode: JOIN_CODE },
];

const PROFILES = {
  r1: { fullName: 'Aoife Brennan', age: 27, bloodType: 'O+', allergies: 'Penicillin', conditions: 'None', medication: 'None',
        emergencyContactName: 'Niamh Brennan', emergencyContactRelationship: 'Sister', emergencyContactPhone: '+353 87 555 0199' },
  r2: { fullName: 'Marek Nowak', age: 34, bloodType: 'A-', allergies: 'None known', conditions: 'Asthma', medication: 'Salbutamol inhaler',
        emergencyContactName: 'Ewa Nowak', emergencyContactRelationship: 'Partner', emergencyContactPhone: '+353 87 555 0198' },
  r3: { fullName: 'Daniel Okafor', age: 22, bloodType: 'B+', allergies: 'Peanuts', conditions: 'None', medication: 'None',
        emergencyContactName: 'Grace Okafor', emergencyContactRelationship: 'Mother', emergencyContactPhone: '+353 87 555 0197' },
};

async function upsertUser(u) {
  let rec;
  try { rec = await auth.getUserByEmail(u.email); await auth.updateUser(rec.uid, { password, displayName: u.name }); }
  catch (e) { rec = await auth.createUser({ email: u.email, password, displayName: u.name, emailVerified: true }); }
  const doc = { name: u.name, email: u.email, phone: u.phone, role: u.role, companyId: COMPANY, status: u.status || 'active',
                createdAt: ago(60 * 24 * 30) };
  if (u.riderNumber) doc.riderNumber = u.riderNumber;
  if (u.deviceId !== undefined) doc.deviceId = u.deviceId;
  if (u.joinCode) doc.joinCode = u.joinCode;
  await db.doc(`users/${rec.uid}`).set(doc);
  return rec.uid;
}

async function main() {
  await db.doc(`companies/${COMPANY}`).set({ name: 'Swift Deliveries (Demo)', countdownSeconds: 20, createdAt: ago(60 * 24 * 60) });
  await db.doc(`companyCodes/${JOIN_CODE}`).set({ companyId: COMPANY, companyName: 'Swift Deliveries (Demo)', createdAt: ago(60 * 24 * 60) });

  const uid = {};
  for (const u of USERS) uid[u.key] = await upsertUser(u);
  for (const [k, p] of Object.entries(PROFILES)) {
    await db.doc(`riderProfiles/${uid[k]}`).set({ ...p, consentEmergencySharing: true, consentAt: ago(60 * 24 * 30) });
  }

  const ok = { battery: 82, imu: 'ok', frontCamera: 'ok', lte: 'ok', gnss: 'ok', state: 'ready' };
  await db.doc('devices/vest-001').set({ companyId: COMPANY, riderId: uid.r1, label: 'Vest 001', active: true,
    lastSeenAt: ago(0.2), status: ok });
  await db.doc('devices/vest-002').set({ companyId: COMPANY, riderId: uid.r2, label: 'Vest 002', active: true,
    lastSeenAt: ago(0.5), status: { ...ok, battery: 41, frontCamera: 'error' } });
  await db.doc('devices/vest-003').set({ companyId: COMPANY, riderId: null, label: 'Vest 003 (spare)', active: true,
    lastSeenAt: ago(60 * 26), status: { ...ok, battery: 0, state: 'off' } });

  const base = (k, extra) => ({ riderId: uid[k], companyId: COMPANY, riderName: USERS.find((u) => u.key === k).name,
    riderPhone: USERS.find((u) => u.key === k).phone, source: 'vest', simulated: true, trigger: 'auto',
    peakAccelG: 7.8, peakRotationDps: 410, tiltDeg: 82, aiVerificationScore: 0.86, aiAssessment: 'rider_down_likely',
    smsStatus: 'accepted', companyNotified: 'push_sent', frontVideoUploadStatus: 'uploaded',
    locationLastKnown: false, ...extra });

  const incidents = {
    'INC-DEMO01': base('r1', { deviceId: 'vest-001', status: 'confirmed', createdAt: ago(6), confirmedAt: ago(5.6),
      latitude: 53.3498, longitude: -6.2603, locationUpdatedAt: ago(0.5),
      frontVideoUploadStatus: 'uploading' }),
    'INC-DEMO02': base('r2', { deviceId: 'vest-002', status: 'acknowledged', createdAt: ago(48), confirmedAt: ago(47.6),
      acknowledgedBy: uid.staff, acknowledgedAt: ago(45), latitude: 53.3331, longitude: -6.2489, trigger: 'sos',
      peakAccelG: null, peakRotationDps: null, tiltDeg: null, aiVerificationScore: null, aiAssessment: null }),
    'INC-DEMO03': base('r3', { deviceId: null, status: 'closed', createdAt: ago(60 * 24 * 3), confirmedAt: ago(60 * 24 * 3 - 0.4),
      acknowledgedBy: uid.staff, acknowledgedAt: ago(60 * 24 * 3 - 3), closedBy: uid.admin, closedAt: ago(60 * 24 * 3 - 70),
      outcome: 'hospital', closeNote: 'Rider taken to St James\'s for checks; minor injuries.', latitude: 53.3441, longitude: -6.2675 }),
    'INC-DEMO04': base('r1', { deviceId: 'vest-001', status: 'cancelled', createdAt: ago(60 * 24), cancelledAt: ago(60 * 24 - 0.2),
      smsStatus: 'not_sent', companyNotified: 'not_needed', peakAccelG: 4.1, aiVerificationScore: 0.22, aiAssessment: 'unclear',
      frontVideoUploadStatus: 'none', latitude: 53.3601, longitude: -6.2511 }),
    'INC-DEMO05': base('r2', { deviceId: 'vest-002', status: 'closed', createdAt: ago(60 * 24 * 9), confirmedAt: ago(60 * 24 * 9 - 0.4),
      smsStatus: 'failed', closedBy: uid.admin, closedAt: ago(60 * 24 * 9 - 30), outcome: 'false_alarm',
      closeNote: 'Vest dropped from scooter seat; SMS failed (no coverage), retried on reconnect.', latitude: 53.3389, longitude: -6.2380,
      frontVideoUploadStatus: 'failed' }),
  };
  const front = arg('--video');
  if (front && !fs.existsSync(front)) throw new Error(`video not found: ${front}`);
  for (const [id, inc] of Object.entries(incidents)) {
    const doc = { incidentId: id, ...inc };
    if (front && doc.frontVideoUploadStatus === 'uploaded') {
      const dir = `incidents/${COMPANY}/${doc.riderId}/${id}`;
      await getStorage().bucket().upload(front, { destination: `${dir}/front_accident_video.mp4`, contentType: 'video/mp4' });
      doc.frontVideoPath = `${dir}/front_accident_video.mp4`;
    } else if (!front) {
      // Without a sample file the demo shows the video as still pending rather than pretending they exist.
      if (doc.frontVideoUploadStatus === 'uploaded') doc.frontVideoUploadStatus = 'pending';
    }
    await db.doc(`incidents/${id}`).set(doc);
    const p = PROFILES[Object.keys(uid).find((k) => uid[k] === doc.riderId)];
    if (p && doc.status !== 'cancelled') await db.doc(`incidents/${id}/private/medical`).set({ consentEmergencySharing: true, ...p });
  }

  console.log(`Seeded company "${COMPANY}" (join code ${JOIN_CODE}) in ${emulator ? 'the EMULATOR' : 'project ' + projectId}.`);
  console.log('Sign in with any of:', USERS.map((u) => `${u.email} (${u.role}${u.status ? ', ' + u.status : ''})`).join(', '));
  console.log(emulator ? 'Emulator password: RideGuard-Demo-2026' : 'Password: the SEED_PASSWORD you set.');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
