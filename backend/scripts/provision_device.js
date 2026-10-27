'use strict';
// Gives a vest its secret so it can call the Cloud Functions API.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/provision_device.js <deviceId> <companyId> [riderUid]
// Register the vest in the web dashboard (Vests → Register vest) first or let this create it; the rider is normally
// assigned in the dashboard. Prints the secret ONCE; only its SHA-256 is stored. Re-running rotates the secret.
const crypto = require('node:crypto');
// firebase-admin is installed in functions/ (cd backend/functions && npm install).
const adminRequire = require('node:module').createRequire(require.resolve('../functions/package.json'));
const { initializeApp } = adminRequire('firebase-admin/app');
const { getFirestore } = adminRequire('firebase-admin/firestore');

const [deviceId, companyId, riderId] = process.argv.slice(2);
if (!deviceId || !companyId) { console.error('usage: provision_device.js <deviceId> <companyId> [riderUid]'); process.exit(1); }
initializeApp();
const secret = crypto.randomBytes(32).toString('hex');
const ref = getFirestore().doc(`devices/${deviceId}`);
ref.get().then(async (d) => {
  if (d.exists && d.get('companyId') !== companyId) throw new Error(`${deviceId} belongs to another company`);
  const update = { companyId, active: true, secretHash: crypto.createHash('sha256').update(secret).digest('hex') };
  if (riderId) update.riderId = riderId;
  else if (!d.exists) update.riderId = null;
  if (!d.exists) update.label = deviceId;
  await ref.set(update, { merge: true });
  console.log(`Put in the vest .env:\nRIDEGUARD_DEVICE_ID=${deviceId}\nRIDEGUARD_DEVICE_SECRET=${secret}`);
  process.exit(0);
}).catch((e) => { console.error(e.message); process.exit(1); });
