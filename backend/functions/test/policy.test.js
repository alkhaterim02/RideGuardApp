'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/policy');

const device = { deviceId: 'vest-1', riderId: 'r1', companyId: 'A' };
const staffA = { uid: 's1', role: 'company_staff', companyId: 'A' };
const staffB = { uid: 's2', role: 'company_staff', companyId: 'B' };
const rider1 = { uid: 'r1', role: 'rider', companyId: 'A' };
const rider2 = { uid: 'r2', role: 'rider', companyId: 'A' };
const create = (id = 'INC-ABC123') => ({ incident_id: id, latitude: 53.3, longitude: -6.2, sms_status: 'accepted' });

test('company isolation and rider ownership', () => {
  const inc = { riderId: 'r1', companyId: 'A' };
  assert.ok(P.canReadIncident(staffA, inc) && P.canReadIncident(rider1, inc));
  assert.ok(!P.canReadIncident(staffB, inc) && !P.canReadIncident(rider2, inc));
  assert.ok(!P.canReadIncident(null, inc) && !P.canReadIncident({ uid: 'x', role: 'company_staff' }, inc));
});

test('device create is idempotent and ignores payload-supplied company/rider', () => {
  const r1 = P.applyDeviceEvent(null, 'create_incident', { ...create(), companyId: 'EVIL', riderId: 'x' }, device);
  assert.ok(r1.ok && r1.incident.companyId === 'A' && r1.incident.riderId === 'r1' && r1.incident.status === 'confirmed');
  const r2 = P.applyDeviceEvent(r1.incident, 'create_incident', create(), device);
  assert.ok(r2.ok && !r2.changed);
});

test('pending -> confirmed, pending -> cancelled; cancelled cannot be confirmed', () => {
  const p = P.applyDeviceEvent(null, 'possible_accident', create(), device).incident;
  assert.equal(P.applyDeviceEvent(p, 'create_incident', create(), device).incident.status, 'confirmed');
  const c = P.applyDeviceEvent(p, 'incident_cancelled', create(), device).incident;
  assert.equal(c.status, 'cancelled');
  const bad = P.applyDeviceEvent(c, 'create_incident', create(), device);
  assert.ok(!bad.ok && bad.error.startsWith('invalid_transition'));
});

test('another device cannot touch an incident; bad payloads rejected', () => {
  const inc = P.applyDeviceEvent(null, 'create_incident', create(), device).incident;
  assert.equal(P.applyDeviceEvent(inc, 'incident_cancelled', create(), { ...device, deviceId: 'vest-2' }).error, 'wrong_device');
  assert.ok(!P.applyDeviceEvent(null, 'create_incident', { incident_id: 'bad id' }, device).ok);
  assert.ok(!P.applyDeviceEvent(null, 'create_incident', { ...create(), latitude: 95 }, device).ok);
  assert.ok(!P.applyDeviceEvent(null, 'create_incident', { ...create(), ai: { score: 3 } }, device).ok);
  assert.equal(P.applyDeviceEvent(null, 'nope', create(), device).error, 'unknown_kind');
});

test('company acknowledge / close with confirmation and audit', () => {
  const inc = P.applyDeviceEvent(null, 'create_incident', create(), device).incident;
  assert.equal(P.applyCompanyAction(staffB, inc, 'acknowledge').error, 'forbidden');
  assert.equal(P.applyCompanyAction(rider1, inc, 'acknowledge').error, 'forbidden');
  const ack = P.applyCompanyAction(staffA, inc, 'acknowledge');
  assert.ok(ack.ok && ack.incident.acknowledgedBy === 's1' && ack.audit.action === 'acknowledge');
  assert.equal(P.applyCompanyAction(staffA, ack.incident, 'close').error, 'confirmation_required');
  const closed = P.applyCompanyAction(staffA, ack.incident, 'close', { confirm: true });
  assert.equal(closed.incident.status, 'closed');
  assert.ok(!P.applyCompanyAction(staffA, closed.incident, 'acknowledge').ok);
  assert.ok(!P.applyCompanyAction(staffA, { ...inc, status: 'cancelled' }, 'close', { confirm: true }).ok);
});

test('medical snapshot needs consent + confirmed emergency for company', () => {
  const inc = { riderId: 'r1', companyId: 'A', status: 'confirmed' };
  const profile = { consentEmergencySharing: true, bloodType: 'O+', allergies: 'x', conditions: 'y', medication: 'z', notes: 'private' };
  assert.deepEqual(Object.keys(P.medicalSnapshotFor(staffA, inc, profile)).sort(), ['allergies', 'bloodType', 'conditions', 'medication']);
  assert.equal(P.medicalSnapshotFor(staffA, inc, { ...profile, consentEmergencySharing: false }), null);
  assert.equal(P.medicalSnapshotFor(staffA, { ...inc, status: 'cancelled' }, profile), null);
  assert.equal(P.medicalSnapshotFor(staffB, inc, profile), null);
});
