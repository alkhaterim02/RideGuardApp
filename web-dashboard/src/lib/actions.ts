import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';
import { getBlob, ref } from 'firebase/storage';
import { auth, db, secondaryApp, storage } from './firebase';
import type { EmergencySnapshot, Outcome, UserDoc } from './types';

// Every write here is also enforced by backend/firestore.rules; the UI checks are only for clear messages.

type AuditAction = 'incident_view' | 'medical_access' | 'video_access' | 'rider_added' | 'rider_updated' | 'device_updated';

export function audit(me: UserDoc, action: AuditAction, extra: { incidentId?: string; riderId?: string; side?: string; detail?: string } = {}) {
  return addDoc(collection(db, 'auditLogs'), { action, by: me.id, byName: me.name, companyId: me.companyId, at: serverTimestamp(), ...extra })
    .catch(() => { /* an audit failure must not block emergency work; rules still restrict access */ });
}

export const acknowledgeIncident = (id: string, me: UserDoc) =>
  updateDoc(doc(db, 'incidents', id), { status: 'acknowledged', acknowledgedBy: me.id, acknowledgedAt: serverTimestamp(), updatedAt: serverTimestamp() });

export const closeIncident = (id: string, me: UserDoc, outcome: Outcome, closeNote: string) =>
  updateDoc(doc(db, 'incidents', id), { status: 'closed', closedBy: me.id, closedAt: serverTimestamp(), outcome, closeNote: closeNote.trim(), updatedAt: serverTimestamp() });

/** Emergency contact + health snapshot. Readable only while the emergency is active; every attempt is audited. */
export async function loadSnapshot(incidentId: string, me: UserDoc): Promise<EmergencySnapshot | null> {
  await audit(me, 'medical_access', { incidentId });
  const s = await getDoc(doc(db, 'incidents', incidentId, 'private', 'medical'));
  return s.exists() ? (s.data() as EmergencySnapshot) : null;
}

/** Downloads through the SDK (Storage rules are checked) rather than a shareable download URL. */
export async function loadVideo(path: string, incidentId: string, me: UserDoc): Promise<string> {
  await audit(me, 'video_access', { incidentId, side: 'front' });
  const blob = await getBlob(ref(storage, path));
  return URL.createObjectURL(blob);
}

export interface NewRider { name: string; email: string; phone: string; riderNumber: string; password: string; deviceId: string | null }

/** Creates the Auth account on a throwaway app instance so the staff member stays signed in. */
export async function addRider(me: UserDoc, r: NewRider): Promise<string> {
  const second = secondaryApp();
  try {
    const cred = await createUserWithEmailAndPassword(second.auth, r.email.trim(), r.password);
    const uid = cred.user.uid;
    await signOut(second.auth);
    await setDoc(doc(db, 'users', uid), {
      name: r.name.trim(), email: r.email.trim().toLowerCase(), phone: r.phone.trim(), role: 'rider', companyId: me.companyId,
      status: 'active', riderNumber: r.riderNumber.trim(), deviceId: r.deviceId, createdAt: serverTimestamp(),
    });
    if (r.deviceId) await updateDoc(doc(db, 'devices', r.deviceId), { riderId: uid, updatedAt: serverTimestamp() });
    await audit(me, 'rider_added', { riderId: uid, detail: r.name.trim() });
    return uid;
  } finally {
    await deleteApp(second.app);
  }
}

export async function addStaff(me: UserDoc, s: { name: string; email: string; phone: string; password: string }) {
  const second = secondaryApp();
  try {
    const cred = await createUserWithEmailAndPassword(second.auth, s.email.trim(), s.password);
    await signOut(second.auth);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: s.name.trim(), email: s.email.trim().toLowerCase(), phone: s.phone.trim(), role: 'company_staff',
      companyId: me.companyId, status: 'active', createdAt: serverTimestamp(),
    });
  } finally {
    await deleteApp(second.app);
  }
}

export async function setRiderStatus(me: UserDoc, rider: UserDoc, status: 'active' | 'inactive') {
  await updateDoc(doc(db, 'users', rider.id), { status, updatedAt: serverTimestamp() });
  await audit(me, 'rider_updated', { riderId: rider.id, detail: `status=${status}` });
}

export const setStaffStatus = (staffId: string, status: 'active' | 'inactive') =>
  updateDoc(doc(db, 'users', staffId), { status, updatedAt: serverTimestamp() });

/** Assigns a vest to a rider (or unassigns with null), keeping users.deviceId and devices.riderId in step. */
export async function assignVest(me: UserDoc, rider: UserDoc, deviceId: string | null, previousHolder?: UserDoc) {
  if (rider.deviceId && rider.deviceId !== deviceId) await updateDoc(doc(db, 'devices', rider.deviceId), { riderId: null, updatedAt: serverTimestamp() });
  if (deviceId) {
    if (previousHolder && previousHolder.id !== rider.id) await updateDoc(doc(db, 'users', previousHolder.id), { deviceId: null, updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'devices', deviceId), { riderId: rider.id, updatedAt: serverTimestamp() });
  }
  await updateDoc(doc(db, 'users', rider.id), { deviceId, updatedAt: serverTimestamp() });
  await audit(me, 'device_updated', { riderId: rider.id, detail: `vest=${deviceId ?? 'none'}` });
}

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

export async function addVest(me: UserDoc, id: string, label: string) {
  const existing = await getDoc(doc(db, 'devices', id)).catch(() => null);
  if (existing?.exists()) throw new Error(`Vest "${id}" already exists.`);
  await setDoc(doc(db, 'devices', id), { companyId: me.companyId, riderId: null, label: label.trim() || id, active: true, createdAt: serverTimestamp() });
}

export const setVestActive = (id: string, active: boolean) => updateDoc(doc(db, 'devices', id), { active, updatedAt: serverTimestamp() });

export const updateCompany = (id: string, data: { name: string; countdownSeconds: number }) =>
  updateDoc(doc(db, 'companies', id), { ...data, updatedAt: serverTimestamp() });

export const createJoinCode = (me: UserDoc, code: string, companyName: string) =>
  setDoc(doc(db, 'companyCodes', code), { companyId: me.companyId, companyName, createdAt: serverTimestamp() });

export const deleteJoinCode = (code: string) => deleteDoc(doc(db, 'companyCodes', code));

export function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => a[x % a.length]).join('');
  return `RIDE-${pick(4)}-${pick(2)}`;
}

/** Turns Firebase error codes into sentences a dispatcher can act on. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/network-request-failed': 'No connection to the server. Check the internet connection.',
    'permission-denied': 'You do not have permission to do this (or the incident changed meanwhile).',
    'storage/unauthorized': 'You do not have permission to view this video.',
    'storage/object-not-found': 'The video file was not found.',
    'unavailable': 'The server is unreachable. Changes will retry when the connection returns.',
  };
  return map[code] || (e instanceof Error ? e.message : 'Something went wrong.');
}
