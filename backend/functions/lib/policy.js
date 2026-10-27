'use strict';
// Pure authorization + state rules. No Firebase imports, so it is unit-testable anywhere.

const STAFF = new Set(['company_admin', 'company_staff']);
// Profile fields copied into an incident's emergency snapshot (incidents/{id}/private/medical), consent permitting.
const SNAPSHOT_FIELDS = ['fullName', 'age', 'bloodType', 'allergies', 'conditions', 'medication',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'];
const pickSnapshot = (p) => Object.fromEntries(SNAPSHOT_FIELDS.filter((k) => p[k] != null).map((k) => [k, p[k]]));
const TRANSITIONS = {
  pending: ['cancelled', 'confirmed'],
  confirmed: ['acknowledged', 'closed'],
  acknowledged: ['closed'],
  cancelled: [],
  closed: [],
};

function canReadIncident(user, inc) {
  if (!user || !inc) return false;
  if (user.role === 'rider') return inc.riderId === user.uid;
  if (STAFF.has(user.role)) return !!user.companyId && inc.companyId === user.companyId;
  return false;
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function validIncidentId(id) { return typeof id === 'string' && /^INC-[A-Z0-9]{4,16}$/.test(id); }

function validateCreatePayload(p) {
  const errors = [];
  if (!validIncidentId(p && p.incident_id)) errors.push('incident_id');
  if (p && p.latitude != null && !(p.latitude >= -90 && p.latitude <= 90)) errors.push('latitude');
  if (p && p.longitude != null && !(p.longitude >= -180 && p.longitude <= 180)) errors.push('longitude');
  if (p && p.ai && p.ai.score != null && !(p.ai.score >= 0 && p.ai.score <= 1)) errors.push('ai.score');
  return errors;
}

// Device-originated events. The device's own record decides riderId/companyId (never the payload).
function applyDeviceEvent(existing, kind, payload, device) {
  const errs = validateCreatePayload(payload);
  if (errs.length) return { ok: false, error: 'invalid:' + errs.join(',') };
  const target = { possible_accident: 'pending', create_incident: 'confirmed', incident_cancelled: 'cancelled' }[kind];
  if (!target) return { ok: false, error: 'unknown_kind' };
  if (!existing) {
    const status = target;
    return { ok: true, changed: true, incident: {
      incidentId: payload.incident_id, deviceId: device.deviceId, riderId: device.riderId, companyId: device.companyId,
      status, cancelled: status === 'cancelled', smsStatus: payload.sms_status || 'pending',
      latitude: payload.latitude ?? null, longitude: payload.longitude ?? null,
      locationLastKnown: payload.location_last_known ?? null,
      aiAssessment: payload.ai ? payload.ai.assessment : null,
      aiVerificationScore: payload.ai && payload.ai.score != null ? payload.ai.score : null,
      source: 'vest', simulated: false, trigger: payload.trigger === 'sos' ? 'sos' : 'auto',
      peakAccelG: num(payload.peak_accel_g), peakRotationDps: num(payload.peak_rotation_dps), tiltDeg: num(payload.tilt_deg),
      frontVideoUploadStatus: 'pending', rearVideoUploadStatus: 'pending',
    } };
  }
  if (existing.deviceId !== device.deviceId) return { ok: false, error: 'wrong_device' };
  if (existing.status === target) return { ok: true, changed: false, incident: existing };   // retry: idempotent
  if (!canTransition(existing.status, target)) return { ok: false, error: `invalid_transition:${existing.status}->${target}` };
  const next = { ...existing, status: target, cancelled: target === 'cancelled' };
  if (target === 'confirmed') {
    Object.assign(next, { smsStatus: payload.sms_status || existing.smsStatus,
      latitude: payload.latitude ?? existing.latitude, longitude: payload.longitude ?? existing.longitude,
      locationLastKnown: payload.location_last_known ?? existing.locationLastKnown });
  }
  return { ok: true, changed: true, incident: next };
}

// Company actions: acknowledge / close. Closing an active emergency needs explicit confirmation.
function applyCompanyAction(user, inc, action, { confirm = false } = {}) {
  if (!canReadIncident(user, inc) || !STAFF.has(user.role)) return { ok: false, error: 'forbidden' };
  const to = { acknowledge: 'acknowledged', close: 'closed' }[action];
  if (!to) return { ok: false, error: 'unknown_action' };
  if (inc.status === to) return { ok: true, changed: false, incident: inc };
  if (to === 'closed' && !confirm) return { ok: false, error: 'confirmation_required' };
  if (!canTransition(inc.status, to)) return { ok: false, error: `invalid_transition:${inc.status}->${to}` };
  const now = new Date().toISOString();
  const next = { ...inc, status: to };
  if (to === 'acknowledged') Object.assign(next, { acknowledgedBy: user.uid, acknowledgedAt: now });
  else Object.assign(next, { closedBy: user.uid, closedAt: now });
  return { ok: true, changed: true, incident: next,
           audit: { action, by: user.uid, companyId: user.companyId, incidentId: inc.incidentId, at: now } };
}

// Health data reaches a company employee only for a confirmed emergency with rider consent.
function medicalSnapshotFor(user, inc, profile) {
  if (!canReadIncident(user, inc)) return null;
  if (user.role === 'rider') return profile || null;
  if (!profile || profile.consentEmergencySharing !== true) return null;
  if (!['confirmed', 'acknowledged'].includes(inc.status)) return null;
  return pickSnapshot(profile);
}

// Rider cancel from the app. Pending: ask the vest to cancel (vest confirms). After confirmation the
// SMS cannot be recalled, so we only record a false-alarm report.
function riderCancelRequest(user, inc) {
  if (!user || user.role !== 'rider' || !inc || inc.riderId !== user.uid) return { ok: false, error: 'forbidden' };
  if (inc.status === 'cancelled') return { ok: true, changed: false, incident: inc };
  if (inc.status === 'pending') {
    if (inc.cancelRequested) return { ok: true, changed: false, incident: inc };
    return { ok: true, changed: true, incident: { ...inc, cancelRequested: true } };
  }
  return { ok: false, error: 'too_late', changed: !inc.falseAlarmRequested, incident: { ...inc, falseAlarmRequested: true } };
}

module.exports = { SNAPSHOT_FIELDS, pickSnapshot, riderCancelRequest, validIncidentId, canReadIncident, canTransition, validateCreatePayload, applyDeviceEvent, applyCompanyAction, medicalSnapshotFor, TRANSITIONS };
