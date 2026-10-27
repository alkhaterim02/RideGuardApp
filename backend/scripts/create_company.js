'use strict';
// Creates a company, its first administrator account and a rider join code. Run once per company.
// Company accounts are never self-registered; everything after this is done in the web dashboard.
//
// Usage (real project): set GOOGLE_APPLICATION_CREDENTIALS=<service-account key.json>, then
//   node scripts/create_company.js --project <project-id> --company <company-id> --name "<Company name>"
//        --admin-email <email> --admin-name "<Full name>" --password <temporary password>
// Emulator: also set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 and FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
const crypto = require('node:crypto');
// firebase-admin is installed in functions/ (cd backend/functions && npm install).
const adminRequire = require('node:module').createRequire(require.resolve('../functions/package.json'));
const { initializeApp } = adminRequire('firebase-admin/app');
const { getAuth } = adminRequire('firebase-admin/auth');
const { getFirestore, FieldValue } = adminRequire('firebase-admin/firestore');

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const [projectId, companyId, name, email, adminName, password] =
  ['--project', '--company', '--name', '--admin-email', '--admin-name', '--password'].map(arg);
if (!projectId || !companyId || !name || !email || !adminName || !password) {
  console.error('usage: create_company.js --project <id> --company <company-id> --name "<name>" --admin-email <email> --admin-name "<name>" --password <temp>');
  process.exit(1);
}
if (!/^[a-z0-9-]{3,40}$/.test(companyId)) { console.error('company-id: 3-40 lowercase letters, digits or dashes'); process.exit(1); }
if (password.length < 8) { console.error('password: at least 8 characters'); process.exit(1); }

initializeApp({ projectId });
const db = getFirestore();

(async () => {
  let user;
  try { user = await getAuth().getUserByEmail(email); console.log('Admin account already exists; keeping its password.'); }
  catch { user = await getAuth().createUser({ email, password, displayName: adminName }); }
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const code = `RIDE-${pick(4)}-${pick(2)}`;
  await db.doc(`companies/${companyId}`).set({ name, countdownSeconds: 20, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.doc(`companyCodes/${code}`).set({ companyId, companyName: name, createdAt: FieldValue.serverTimestamp() });
  await db.doc(`users/${user.uid}`).set({ name: adminName, email: email.toLowerCase(), phone: '', role: 'company_admin', companyId,
    status: 'active', createdAt: FieldValue.serverTimestamp() });
  console.log(`Company "${name}" (${companyId}) ready.`);
  console.log(`Administrator: ${email} – sign in to the web dashboard and change the password via "Forgot password".`);
  console.log(`Rider join code: ${code}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
