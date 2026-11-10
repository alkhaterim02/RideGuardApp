'use strict';
// Endpoint logic over an abstract `store` (Firebase adapter lives in index.js; tests use an in-memory one).
const crypto = require('node:crypto');
const P = require('./policy');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const R = (status, body) => ({ status, body });
const SIDES = new Set(['front']);   // the vest has a single front camera
const EVENT_KINDS = new Set(['possible_accident', 'create_incident', 'incident_cancelled']);

async function authDevice(store, headers) {
  const id = headers['x-device-id'];
  const m = /^Bearer (.+)$/.exec(headers['authorization'] || '');
  if (!id || !m) return null;
  const d = await store.getDevice(id);
  if (!d || d.active === false || !d.secretHash) return null;
  return safeEq(sha(m[1]), d.secretHash) ? d : null;
}

async function bestEffort(fn) { try { await fn(); } catch (e) { /* notification failure must never fail the emergency */ } }

async function handleDevice(store, { kind, headers, body }) {
  const device = await authDevice(store, headers || {});
  if (!device) return R(401, { error: 'unauthorized' });
  body = body || {};

  if (kind === 'heartbeat') {
    await store.putDeviceStatus(device.deviceId, { lastSeenAt: store.now(), status: body.status || {} });
    return R(200, { ok: true, cancel_requested: await store.listCancelRequests(device.deviceId) });
  }

  if (kind === 'upload_url' || kind === 'upload_complete') {
    if (!SIDES.has(body.side) || !P.validIncidentId(body.incident_id)) return R(400, { error: 'invalid' });
    const inc = await store.getIncident(body.incident_id);
    if (!inc || inc.deviceId !== device.deviceId) return R(404, { error: 'not_found' });
    const path = `incidents/${inc.companyId}/${inc.riderId}/${inc.incidentId}/${body.side}_accident_video.mp4`;
    if (kind === 'upload_url') {
      return R(200, { url: await store.signUpload(path), path, content_type: 'video/mp4' });
    }
    if (inc[body.side + 'VideoUploadStatus'] === 'uploaded') return R(200, { ok: true, changed: false });
    await store.putIncident({ ...inc, [body.side + 'VideoPath']: path, [body.side + 'VideoUploadStatus']: 'uploaded' });
    return R(200, { ok: true, changed: true });
  }

  if (!EVENT_KINDS.has(kind)) return R(404, { error: 'unknown_kind' });
  const errs = P.validateCreatePayload(body);
  if (errs.length) return R(400, { error: 'invalid:' + errs.join(',') });
  const existing = await store.getIncident(body.incident_id);
  const res = P.applyDeviceEvent(existing, kind, body, device);
  if (!res.ok) return R(res.error === 'wrong_device' ? 403 : res.error.startsWith('invalid_transition') ? 409 : 400, { error: res.error });
  if (res.changed) {
    await store.putIncident(res.incident);
    if (kind === 'create_incident') {
      const profile = await store.getProfile(device.riderId);
      if (profile && profile.consentEmergencySharing === true) {
        await store.putMedicalSnapshot(res.incident.incidentId, { consentEmergencySharing: true, ...P.pickSnapshot(profile) });
      }
      await bestEffort(() => store.notify({ type: 'emergency', companyId: device.companyId, riderId: device.riderId, incidentId: res.incident.incidentId }));
    }
  }
  return R(200, { ok: true, changed: !!res.changed });
}

async function handleCompanyAction(store, user, id, action, opts) {
  const inc = await store.getIncident(id);
  if (!inc || !P.canReadIncident(user, inc)) return R(404, { error: 'not_found' });   // 404, not 403: don't reveal other tenants' IDs
  const res = P.applyCompanyAction(user, inc, action, opts);
  if (!res.ok) return R(res.error === 'forbidden' ? 403 : res.error === 'confirmation_required' ? 400 : 409, { error: res.error });
  if (res.changed) {
    await store.putIncident(res.incident);
    await store.audit(res.audit);
    await bestEffort(() => store.notify({ type: action, companyId: inc.companyId, riderId: inc.riderId, incidentId: id }));
  }
  return R(200, { ok: true, changed: !!res.changed, status: res.incident.status });
}

async function handleRiderCancel(store, user, id) {
  const inc = await store.getIncident(id);
  if (!inc || !P.canReadIncident(user, inc)) return R(404, { error: 'not_found' });
  const res = P.riderCancelRequest(user, inc);
  if (res.changed) await store.putIncident(res.incident);
  if (!res.ok) {
    return R(res.error === 'forbidden' ? 403 : 409, { error: res.error,
      note: res.error === 'too_late' ? 'The alert was already sent and cannot be recalled. A false-alarm report was recorded.' : undefined });
  }
  return R(200, { ok: true, requested: true, note: inc.status === 'pending' ? 'The vest cancels on its next check-in; use the physical button for instant cancel.' : undefined });
}

async function handleMedical(store, user, id) {
  const inc = await store.getIncident(id);
  if (!inc || !P.canReadIncident(user, inc)) return R(404, { error: 'not_found' });
  const snap = P.medicalSnapshotFor(user, inc, await store.getMedicalSnapshot(id));
  await store.audit({ action: 'medical_access', by: user.uid, companyId: inc.companyId, incidentId: id, at: store.now(), granted: !!snap });
  return snap ? R(200, { medical: snap }) : R(403, { error: 'not_available' });
}

async function handleVideoUrl(store, user, id, side) {
  if (!SIDES.has(side)) return R(400, { error: 'invalid_side' });
  const inc = await store.getIncident(id);
  if (!inc || !P.canReadIncident(user, inc)) return R(404, { error: 'not_found' });
  if (inc[side + 'VideoUploadStatus'] !== 'uploaded' || !inc[side + 'VideoPath']) return R(404, { error: 'video_not_available' });
  await store.audit({ action: 'video_access', by: user.uid, companyId: inc.companyId, incidentId: id, side, at: store.now() });
  return R(200, { url: await store.signRead(inc[side + 'VideoPath']), expires_in_s: 300 });
}

module.exports = { handleDevice, handleCompanyAction, handleRiderCancel, handleMedical, handleVideoUrl, sha, authDevice };
