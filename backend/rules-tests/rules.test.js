// Security rules tests. Needs the emulators: (in backend/) firebase emulators:start --only auth,firestore,storage --project demo-rideguard
// then: cd backend/rules-tests && npm install && npm test
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { ref, getBytes, uploadString } from 'firebase/storage';

let env;
const A = 'co-a', B = 'co-b';
const now = () => Timestamp.now();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rideguard',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('../storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const u = (id, d) => setDoc(doc(db, 'users', id), { name: id, email: `${id}@t.test`, ...d });
    await u('adminA', { role: 'company_admin', companyId: A, status: 'active' });
    await u('staffA', { role: 'company_staff', companyId: A, status: 'active' });
    await u('staffB', { role: 'company_staff', companyId: B, status: 'active' });
    await u('riderA', { role: 'rider', companyId: A, status: 'active' });
    await u('riderA2', { role: 'rider', companyId: A, status: 'active' });
    await u('pendingA', { role: 'rider', companyId: A, status: 'pending', joinCode: 'CODE-A' });
    await setDoc(doc(db, 'companies', A), { name: 'A', countdownSeconds: 20 });
    await setDoc(doc(db, 'companyCodes', 'CODE-A'), { companyId: A, companyName: 'A' });
    await setDoc(doc(db, 'devices', 'vest-1'), { companyId: A, riderId: 'riderA', active: true, secretHash: 'x' });
    const inc = (id, d) => setDoc(doc(db, 'incidents', id), { incidentId: id, riderId: 'riderA', companyId: A, source: 'vest', simulated: false, createdAt: now(), ...d });
    await inc('INC-CONF1', { status: 'confirmed' });
    await inc('INC-PEND1', { status: 'pending' });
    await inc('INC-CLOS1', { status: 'closed' });
    await setDoc(doc(db, 'incidents', 'INC-CONF1', 'private', 'medical'), { consentEmergencySharing: true, bloodType: 'O+' });
    await setDoc(doc(db, 'incidents', 'INC-CLOS1', 'private', 'medical'), { consentEmergencySharing: true, bloodType: 'O+' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const simInc = (id, extra = {}) => ({ incidentId: id, riderId: 'riderA', companyId: A, source: 'app', simulated: true, status: 'pending',
  trigger: 'auto', countdownSeconds: 5, createdAt: serverTimestamp(), riderName: 'riderA', ...extra });

test('rider self-registration needs a matching join code and pending status', async () => {
  const db = env.authenticatedContext('newRider').firestore();
  const base = { name: 'New', email: 'n@t.test', role: 'rider', companyId: A, joinCode: 'CODE-A' };
  await assertFails(setDoc(doc(db, 'users', 'newRider'), { ...base, status: 'active' }));
  await assertFails(setDoc(doc(db, 'users', 'newRider'), { ...base, status: 'pending', companyId: B }));
  await assertFails(setDoc(doc(db, 'users', 'newRider'), { ...base, status: 'pending', role: 'company_admin' }));
  await assertFails(setDoc(doc(db, 'users', 'newRider'), { ...base, status: 'pending', joinCode: 'NOPE' }));
  await assertSucceeds(setDoc(doc(db, 'users', 'newRider'), { ...base, status: 'pending' }));
});

test('users cannot promote themselves; staff manage riders of their own company only', async () => {
  await assertFails(updateDoc(doc(as('riderA'), 'users', 'riderA'), { role: 'company_admin' }));
  await assertFails(updateDoc(doc(as('pendingA'), 'users', 'pendingA'), { status: 'active' }));
  await assertSucceeds(updateDoc(doc(as('riderA'), 'users', 'riderA'), { phone: '123' }));
  await assertSucceeds(updateDoc(doc(as('staffA'), 'users', 'pendingA'), { status: 'active' }));
  await assertFails(updateDoc(doc(as('staffB'), 'users', 'riderA'), { status: 'inactive' }));
  await assertFails(updateDoc(doc(as('staffA'), 'users', 'riderA'), { role: 'company_admin' }));
  await assertFails(updateDoc(doc(as('staffA'), 'users', 'adminA'), { status: 'inactive' }));
  await assertSucceeds(setDoc(doc(as('staffA'), 'users', 'added'), { name: 'Added', email: 'a@t.test', role: 'rider', companyId: A, status: 'active' }));
  await assertFails(setDoc(doc(as('staffA'), 'users', 'added2'), { name: 'Added', email: 'a@t.test', role: 'rider', companyId: B, status: 'active' }));
  await assertFails(setDoc(doc(as('staffA'), 'users', 'added3'), { name: 'Boss', email: 'b@t.test', role: 'company_staff', companyId: A, status: 'active' }));
  await assertSucceeds(setDoc(doc(as('adminA'), 'users', 'added4'), { name: 'Boss', email: 'b@t.test', role: 'company_staff', companyId: A, status: 'active' }));
});

test('company isolation for incidents, users and devices', async () => {
  await assertSucceeds(getDoc(doc(as('staffA'), 'incidents', 'INC-CONF1')));
  await assertFails(getDoc(doc(as('staffB'), 'incidents', 'INC-CONF1')));
  await assertFails(getDocs(query(collection(as('staffB'), 'incidents'), where('companyId', '==', A))));
  await assertSucceeds(getDocs(query(collection(as('staffA'), 'incidents'), where('companyId', '==', A))));
  await assertFails(getDoc(doc(as('riderA2'), 'incidents', 'INC-CONF1')));
  await assertFails(getDoc(doc(as('pendingA'), 'incidents', 'INC-CONF1')));
  await assertSucceeds(getDocs(query(collection(as('riderA'), 'incidents'), where('riderId', '==', 'riderA'))));
  await assertFails(getDocs(query(collection(as('staffB'), 'users'), where('companyId', '==', A))));
  await assertSucceeds(getDoc(doc(as('riderA'), 'devices', 'vest-1')));
  await assertFails(getDoc(doc(as('riderA2'), 'devices', 'vest-1')));
  await assertFails(setDoc(doc(as('staffA'), 'devices', 'vest-9'), { companyId: A, riderId: null, label: 'x', active: true, secretHash: 'evil' }));
  await assertSucceeds(setDoc(doc(as('staffA'), 'devices', 'vest-9'), { companyId: A, riderId: null, label: 'x', active: true }));
  await assertFails(updateDoc(doc(as('staffA'), 'devices', 'vest-1'), { secretHash: 'evil' }));
});

test('simulated countdown: create, cannot confirm early, can confirm after deadline', async () => {
  const db = as('riderA');
  await assertFails(setDoc(doc(db, 'incidents', 'INC-SIM01'), simInc('INC-SIM01', { companyId: B })));
  await assertFails(setDoc(doc(db, 'incidents', 'INC-SIM01'), simInc('INC-SIM01', { simulated: false })));
  await assertFails(setDoc(doc(db, 'incidents', 'INC-SIM01'), simInc('INC-SIM01', { status: 'confirmed' })));
  await assertFails(setDoc(doc(db, 'incidents', 'INC-SIM01'), simInc('INC-SIM01', { createdAt: Timestamp.fromMillis(Date.now() - 60000) })));
  await assertFails(setDoc(doc(as('pendingA'), 'incidents', 'INC-SIM01'), simInc('INC-SIM01', { riderId: 'pendingA' })));
  await assertSucceeds(setDoc(doc(db, 'incidents', 'INC-SIM01'), simInc('INC-SIM01')));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-SIM01'), { status: 'confirmed', smsStatus: 'simulated' }));
  await new Promise((r) => setTimeout(r, 5500));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-SIM01'), { status: 'confirmed', smsStatus: 'simulated', confirmedAt: serverTimestamp() }));
});

test('simulated cancel; vest incidents only accept a cancel request', async () => {
  const db = as('riderA');
  await assertSucceeds(setDoc(doc(db, 'incidents', 'INC-SIM02'), simInc('INC-SIM02')));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-SIM02'), { status: 'cancelled', cancelledAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-SIM02'), { status: 'confirmed' }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-PEND1'), { status: 'cancelled' }));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-PEND1'), { cancelRequested: true }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'cancelled' }));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { falseAlarmRequested: true }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { deletionRequested: true }));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-CLOS1'), { deletionRequested: true, deletionRequestedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('riderA2'), 'incidents', 'INC-PEND1'), { cancelRequested: true }));
});

test('SOS with emergency snapshot in one batch', async () => {
  const db = as('riderA');
  const b = writeBatch(db);
  b.set(doc(db, 'incidents', 'INC-SOS01'), { incidentId: 'INC-SOS01', riderId: 'riderA', companyId: A, source: 'app', simulated: false,
    status: 'confirmed', trigger: 'sos', createdAt: serverTimestamp(), confirmedAt: serverTimestamp(), smsStatus: 'no_vest' });
  b.set(doc(db, 'incidents', 'INC-SOS01', 'private', 'medical'), { consentEmergencySharing: true, bloodType: 'A-' });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(db, 'incidents', 'INC-PEND1', 'private', 'medical'), { consentEmergencySharing: true }));
});

test('company acknowledge and close follow the state machine', async () => {
  const db = as('staffA');
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-PEND1'), { status: 'acknowledged', acknowledgedBy: 'staffA', acknowledgedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'acknowledged', acknowledgedBy: 'someoneElse', acknowledgedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('staffB'), 'incidents', 'INC-CONF1'), { status: 'acknowledged', acknowledgedBy: 'staffB', acknowledgedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('riderA'), 'incidents', 'INC-CONF1'), { status: 'acknowledged', acknowledgedBy: 'riderA', acknowledgedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'acknowledged', acknowledgedBy: 'staffA', acknowledgedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'closed', closedBy: 'staffA', closedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'closed', closedBy: 'staffA', closedAt: serverTimestamp(), outcome: 'rider_safe', closeNote: '' }));
  await assertFails(updateDoc(doc(db, 'incidents', 'INC-CONF1'), { status: 'confirmed' }));
});

test('health snapshot: same company, active emergency only', async () => {
  await assertSucceeds(getDoc(doc(as('staffA'), 'incidents', 'INC-CONF1', 'private', 'medical')));
  await assertFails(getDoc(doc(as('staffB'), 'incidents', 'INC-CONF1', 'private', 'medical')));
  await assertFails(getDoc(doc(as('staffA'), 'incidents', 'INC-CLOS1', 'private', 'medical')));
  await assertSucceeds(getDoc(doc(as('riderA'), 'incidents', 'INC-CLOS1', 'private', 'medical')));
  await assertFails(getDoc(doc(as('riderA2'), 'incidents', 'INC-CONF1', 'private', 'medical')));
  await assertFails(getDoc(doc(as('staffA'), 'riderProfiles', 'riderA')));
});

test('audit log: staff append as themselves, only admins read', async () => {
  const entry = (by, companyId = A) => ({ action: 'incident_view', by, companyId, incidentId: 'INC-CONF1', at: serverTimestamp() });
  await assertSucceeds(addDoc(collection(as('staffA'), 'auditLogs'), entry('staffA')));
  await assertFails(addDoc(collection(as('staffA'), 'auditLogs'), entry('adminA')));
  await assertFails(addDoc(collection(as('staffA'), 'auditLogs'), entry('staffA', B)));
  await assertFails(addDoc(collection(as('riderA'), 'auditLogs'), entry('riderA')));
  await assertFails(getDocs(query(collection(as('staffA'), 'auditLogs'), where('companyId', '==', A))));
  await assertSucceeds(getDocs(query(collection(as('adminA'), 'auditLogs'), where('companyId', '==', A))));
});

test('join codes can be fetched but not listed; admin manages them', async () => {
  await assertSucceeds(getDoc(doc(as('newPerson'), 'companyCodes', 'CODE-A')));
  await assertFails(getDocs(collection(as('riderA'), 'companyCodes')));
  await assertFails(setDoc(doc(as('staffA'), 'companyCodes', 'CODE-X'), { companyId: A, companyName: 'A' }));
  await assertSucceeds(setDoc(doc(as('adminA'), 'companyCodes', 'CODE-X'), { companyId: A, companyName: 'A' }));
  await assertFails(setDoc(doc(as('adminA'), 'companyCodes', 'CODE-Y'), { companyId: B, companyName: 'B' }));
});

test('storage: videos readable by same company and the rider, never writable', async () => {
  const path = `incidents/${A}/riderA/INC-CONF1/front_accident_video.mp4`;
  await env.withSecurityRulesDisabled((ctx) => uploadString(ref(ctx.storage(), path), 'fake-mp4'));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('staffA').storage(), path)));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('riderA').storage(), path)));
  await assertFails(getBytes(ref(env.authenticatedContext('staffB').storage(), path)));
  await assertFails(getBytes(ref(env.authenticatedContext('riderA2').storage(), path)));
  await assertFails(uploadString(ref(env.authenticatedContext('riderA').storage(), path), 'overwrite'));
});
