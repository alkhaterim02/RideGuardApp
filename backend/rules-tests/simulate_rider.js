// Plays the rider's phone against the local emulators: same writes as the Android app (data/Repo.java).
// Useful for demos and for checking the dashboard alarm without a phone.
//   node simulate_rider.js countdown   – possible accident, 5 s countdown, then confirmed (with health snapshot)
//   node simulate_rider.js cancel      – possible accident, cancelled by the rider after 2 s
//   node simulate_rider.js sos         – manual SOS, confirmed immediately
// Options: --email aoife@rideguard.test --password RideGuard-Demo-2026 (the seed_demo.js accounts)
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc, terminate, updateDoc, writeBatch } from 'firebase/firestore';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const mode = process.argv[2] || 'countdown';
const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-rideguard' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const SNAPSHOT_FIELDS = ['fullName', 'age', 'bloodType', 'allergies', 'conditions', 'medication',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => 'INC-' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

const cred = await signInWithEmailAndPassword(auth, arg('--email', 'aoife@rideguard.test'), arg('--password', 'RideGuard-Demo-2026'));
const me = (await getDoc(doc(db, 'users', cred.user.uid))).data();
const profile = (await getDoc(doc(db, 'riderProfiles', cred.user.uid))).data();
const id = newId();
const base = { incidentId: id, riderId: cred.user.uid, companyId: me.companyId, deviceId: me.deviceId ?? null, riderName: me.name,
  riderPhone: me.phone, source: 'app', createdAt: serverTimestamp(), latitude: 53.3478, longitude: -6.2597, locationLastKnown: false,
  locationUpdatedAt: serverTimestamp(), companyNotified: 'dashboard', updatedAt: serverTimestamp() };
const snapshot = (b) => {
  if (!profile?.consentEmergencySharing) return;
  const s = { consentEmergencySharing: true };
  for (const k of SNAPSHOT_FIELDS) if (profile[k] != null) s[k] = profile[k];
  b.set(doc(db, 'incidents', id, 'private', 'medical'), s);
};

if (mode === 'sos') {
  const b = writeBatch(db);
  b.set(doc(db, 'incidents', id), { ...base, simulated: true, status: 'confirmed', trigger: 'sos', confirmedAt: serverTimestamp(), smsStatus: 'simulated' });
  snapshot(b);
  await b.commit();
  console.log(`SOS ${id} sent as ${me.name}.`);
} else {
  await setDoc(doc(db, 'incidents', id), { ...base, simulated: true, status: 'pending', trigger: 'auto', countdownSeconds: 5,
    peakAccelG: 6.4, peakRotationDps: 380, tiltDeg: 78, aiVerificationScore: 0.81, aiAssessment: 'rider_down_likely',
    smsStatus: 'pending', frontVideoUploadStatus: 'none' });
  console.log(`Possible accident ${id} for ${me.name}: 5 s countdown…`);
  if (mode === 'cancel') {
    await sleep(2000);
    await updateDoc(doc(db, 'incidents', id), { status: 'cancelled', cancelledAt: serverTimestamp(), smsStatus: 'not_sent', companyNotified: 'not_needed', updatedAt: serverTimestamp() });
    console.log('Cancelled by rider.');
  } else {
    await sleep(5500);
    const b = writeBatch(db);
    b.update(doc(db, 'incidents', id), { status: 'confirmed', confirmedAt: serverTimestamp(), smsStatus: 'simulated', updatedAt: serverTimestamp() });
    snapshot(b);
    await b.commit();
    console.log('Countdown ended: emergency confirmed.');
  }
}
await terminate(db);
process.exit(0);
