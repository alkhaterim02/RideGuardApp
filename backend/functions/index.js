'use strict';
// Firebase wiring for lib/handlers.js. NOT run against real Firebase or the emulator in the build sandbox:
// deploy to a test project and exercise it before relying on it.
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { getMessaging } = require('firebase-admin/messaging');
const H = require('./lib/handlers');

initializeApp();
const db = getFirestore();
const bucket = () => getStorage().bucket();

const store = {
  now: () => new Date().toISOString(),
  getDevice: async (id) => { const d = await db.doc(`devices/${id}`).get(); return d.exists ? { deviceId: id, ...d.data() } : null; },
  putDeviceStatus: (id, st) => db.doc(`devices/${id}`).set({ lastSeenAt: FieldValue.serverTimestamp(), status: st.status }, { merge: true }),
  getIncident: async (id) => { const d = await db.doc(`incidents/${id}`).get(); return d.exists ? d.data() : null; },
  putIncident: async (i) => {
    const extra = { updatedAt: FieldValue.serverTimestamp() };
    if (!i.createdAt) {                     // first write: stamp time and denormalize the rider's name for lists
      extra.createdAt = FieldValue.serverTimestamp();
      const u = await db.doc(`users/${i.riderId}`).get();
      if (u.exists) { extra.riderName = u.get('name') || null; extra.riderPhone = u.get('phone') || null; }
    }
    if (i.status === 'confirmed' && !i.confirmedAt) extra.confirmedAt = FieldValue.serverTimestamp();
    return db.doc(`incidents/${i.incidentId}`).set({ ...i, ...extra });
  },
  getProfile: async (uid) => { const d = await db.doc(`riderProfiles/${uid}`).get(); return d.exists ? d.data() : null; },
  putMedicalSnapshot: (id, m) => db.doc(`incidents/${id}/private/medical`).set(m),
  getMedicalSnapshot: async (id) => { const d = await db.doc(`incidents/${id}/private/medical`).get(); return d.exists ? d.data() : null; },
  audit: (a) => db.collection('auditLogs').add({ ...a, loggedAt: FieldValue.serverTimestamp() }),
  notify: async (n) => {
    await db.collection('notificationLogs').add({ ...n, at: FieldValue.serverTimestamp() });
    // Push for emergencies is sent by onIncidentWritten below, so app-created SOS incidents are covered too.
  },
  listCancelRequests: async (deviceId) => {
    const q = await db.collection('incidents').where('deviceId', '==', deviceId).where('status', '==', 'pending').where('cancelRequested', '==', true).get();
    return q.docs.map((d) => d.id);
  },
  signUpload: async (path) => (await bucket().file(path).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60e3, contentType: 'video/mp4' }))[0],
  signRead: async (path) => (await bucket().file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 5 * 60e3 }))[0],
};

// Roles live in users/{uid} (same model as firestore.rules), not in custom claims.
async function userFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return null;
  try {
    const t = await getAuth().verifyIdToken(m[1]);
    const u = await db.doc(`users/${t.uid}`).get();
    if (!u.exists || u.get('status') !== 'active') return null;
    return { uid: t.uid, role: u.get('role'), companyId: u.get('companyId') };
  } catch (e) { return null; }
}

exports.api = onRequest({ region: 'europe-west1', maxInstances: 10 }, async (req, res) => {
  try {
    const path = req.path.replace(/\/+$/, '');
    let m, out;
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'method' });
    if (req.method === 'POST' && (m = /^\/device\/([a-z_]+)$/.exec(path))) {
      out = await H.handleDevice(store, { kind: m[1], headers: req.headers, body: req.body });
    } else {
      const user = await userFrom(req);
      if (!user) return res.status(401).json({ error: 'unauthorized' });
      if (req.method === 'POST' && (m = /^\/company\/incidents\/([A-Z0-9-]+)\/(acknowledge|close)$/.exec(path))) {
        out = await H.handleCompanyAction(store, user, m[1], m[2], { confirm: !!(req.body && req.body.confirm) });
      } else if (req.method === 'POST' && (m = /^\/rider\/incidents\/([A-Z0-9-]+)\/cancel$/.exec(path))) {
        out = await H.handleRiderCancel(store, user, m[1]);
      } else if (req.method === 'GET' && (m = /^\/incidents\/([A-Z0-9-]+)\/medical$/.exec(path))) {
        out = await H.handleMedical(store, user, m[1]);
      } else if (req.method === 'GET' && (m = /^\/incidents\/([A-Z0-9-]+)\/video\/(front)$/.exec(path))) {
        out = await H.handleVideoUrl(store, user, m[1], m[2]);
      } else out = { status: 404, body: { error: 'not_found' } };
    }
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('api error', e.message);     // never log tokens, secrets or health data
    res.status(500).json({ error: 'internal' });
  }
});

// Push notification to the company (topic company_<id>) and the rider when an incident becomes confirmed,
// whether the vest or the app created it. Needs the Blaze plan; without it the apps still update live via Firestore.
exports.onIncidentWritten = onDocumentWritten({ document: 'incidents/{id}', region: 'europe-west1' }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || after.status !== 'confirmed' || (before && before.status === 'confirmed')) return;
  const sim = after.simulated ? ' (SIMULATION)' : '';
  try {
    await getMessaging().send({
      topic: `company_${after.companyId}`,
      notification: { title: `Emergency${sim}: ${after.riderName || 'rider'}`, body: 'A rider emergency was confirmed. Open RideGuard now.' },
      data: { incidentId: event.params.id, type: 'emergency' },
      android: { priority: 'high', notification: { channelId: 'emergencies' } },
    });
    await event.data.after.ref.update({ companyNotified: 'push_sent' });
  } catch (e) {
    console.error('push failed', e.code || e.message);
    await event.data.after.ref.update({ companyNotified: 'push_failed' });
  }
});
