'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('../lib/handlers');

function makeStore() {
  const s = { inc: {}, med: {}, audits: [], notes: [], failNotify: false,
    devices: { 'vest-1': { deviceId: 'vest-1', riderId: 'r1', companyId: 'A', secretHash: H.sha('good-secret') } },
    profiles: { r1: { consentEmergencySharing: true, bloodType: 'O+', allergies: 'x', conditions: 'y', medication: 'z', notes: 'private' } },
    now: () => '2026-10-11T10:00:00Z',
    getDevice: async (id) => s.devices[id], putDeviceStatus: async () => {},
    getIncident: async (id) => s.inc[id], putIncident: async (i) => { s.inc[i.incidentId] = i; },
    getProfile: async (id) => s.profiles[id], putMedicalSnapshot: async (id, m) => { s.med[id] = m; },
    getMedicalSnapshot: async (id) => s.med[id], audit: async (a) => { s.audits.push(a); },
    notify: async (n) => { if (s.failNotify) throw new Error('fcm down'); s.notes.push(n); },
    listCancelRequests: async (d) => Object.values(s.inc).filter((i) => i.deviceId === d && i.status === 'pending' && i.cancelRequested).map((i) => i.incidentId),
    signUpload: async (p) => 'https://upload.example/' + p, signRead: async (p) => 'https://read.example/' + p };
  return s;
}
const hdr = (secret = 'good-secret', id = 'vest-1') => ({ 'x-device-id': id, authorization: 'Bearer ' + secret });
const dev = (s, kind, body, headers = hdr()) => H.handleDevice(s, { kind, headers, body });
const body = (id = 'INC-ABC123') => ({ incident_id: id, latitude: 53.3, longitude: -6.2, sms_status: 'accepted' });
const staffA = { uid: 's1', role: 'company_staff', companyId: 'A' };
const staffB = { uid: 's2', role: 'company_staff', companyId: 'B' };
const rider1 = { uid: 'r1', role: 'rider', companyId: 'A' };

test('device authentication', async () => {
  const s = makeStore();
  assert.equal((await dev(s, 'create_incident', body(), hdr('bad'))).status, 401);
  assert.equal((await dev(s, 'create_incident', body(), {})).status, 401);
  assert.equal((await dev(s, 'create_incident', body(), hdr('good-secret', 'nope'))).status, 401);
  s.devices['vest-1'].active = false;
  assert.equal((await dev(s, 'create_incident', body())).status, 401);
});

test('create is idempotent; notification sent once; medical snapshot stored with consent', async () => {
  const s = makeStore();
  assert.equal((await dev(s, 'create_incident', body())).body.changed, true);
  assert.equal((await dev(s, 'create_incident', body())).body.changed, false);
  assert.equal(s.notes.length, 1);
  assert.deepEqual(Object.keys(s.med['INC-ABC123']).sort(), ['allergies', 'bloodType', 'conditions', 'consentEmergencySharing', 'medication']);
});

test('no medical snapshot without consent; notify failure does not fail the emergency', async () => {
  const s = makeStore(); s.profiles.r1.consentEmergencySharing = false; s.failNotify = true;
  const r = await dev(s, 'create_incident', body());
  assert.equal(r.status, 200); assert.equal(s.med['INC-ABC123'], undefined);
  assert.equal(s.inc['INC-ABC123'].status, 'confirmed');
});

test('validation and transition errors', async () => {
  const s = makeStore();
  assert.equal((await dev(s, 'create_incident', { incident_id: 'x' })).status, 400);
  assert.equal((await dev(s, 'nope', body())).status, 404);
  await dev(s, 'incident_cancelled', body());
  assert.equal((await dev(s, 'create_incident', body())).status, 409);
});

test('rider app cancel: request -> heartbeat delivers -> vest confirms cancel', async () => {
  const s = makeStore();
  await dev(s, 'possible_accident', body());
  const r = await H.handleRiderCancel(s, rider1, 'INC-ABC123');
  assert.equal(r.status, 200);
  assert.deepEqual((await dev(s, 'heartbeat', {})).body.cancel_requested, ['INC-ABC123']);
  assert.equal(s.inc['INC-ABC123'].status, 'pending');                 // app request alone does not cancel
  await dev(s, 'incident_cancelled', body());
  assert.equal(s.inc['INC-ABC123'].status, 'cancelled');
  assert.deepEqual((await dev(s, 'heartbeat', {})).body.cancel_requested, []);
  assert.equal((await H.handleRiderCancel(s, rider1, 'INC-ABC123')).status, 200);   // duplicate is safe
});

test('rider cancel after confirmation is refused and recorded as a false-alarm report', async () => {
  const s = makeStore(); await dev(s, 'create_incident', body());
  const r = await H.handleRiderCancel(s, rider1, 'INC-ABC123');
  assert.equal(r.status, 409); assert.equal(r.body.error, 'too_late');
  assert.equal(s.inc['INC-ABC123'].falseAlarmRequested, true); assert.equal(s.inc['INC-ABC123'].status, 'confirmed');
  assert.equal((await H.handleRiderCancel(s, { uid: 'r2', role: 'rider' }, 'INC-ABC123')).status, 404);
});

test('company isolation, acknowledge, close confirmation, audit', async () => {
  const s = makeStore(); await dev(s, 'create_incident', body());
  assert.equal((await H.handleCompanyAction(s, staffB, 'INC-ABC123', 'acknowledge')).status, 404);
  assert.equal((await H.handleCompanyAction(s, rider1, 'INC-ABC123', 'acknowledge')).status, 403);
  assert.equal((await H.handleCompanyAction(s, staffA, 'INC-ABC123', 'acknowledge')).status, 200);
  assert.equal((await H.handleCompanyAction(s, staffA, 'INC-ABC123', 'close', {})).status, 400);
  assert.equal((await H.handleCompanyAction(s, staffA, 'INC-ABC123', 'close', { confirm: true })).body.status, 'closed');
  assert.equal(s.audits.filter((a) => a.action).length, 2);
  assert.equal((await H.handleCompanyAction(s, staffA, 'NOPE', 'close', { confirm: true })).status, 404);
});

test('medical access: tenant, consent, status; every attempt audited', async () => {
  const s = makeStore(); await dev(s, 'create_incident', body());
  assert.equal((await H.handleMedical(s, staffB, 'INC-ABC123')).status, 404);
  const ok = await H.handleMedical(s, staffA, 'INC-ABC123');
  assert.equal(ok.status, 200); assert.equal(ok.body.medical.notes, undefined);
  await H.handleCompanyAction(s, staffA, 'INC-ABC123', 'close', { confirm: true });
  assert.equal((await H.handleMedical(s, staffA, 'INC-ABC123')).status, 403);
  assert.ok(s.audits.filter((a) => a.action === 'medical_access').length >= 2);
});

test('video upload flow and authorized, audited playback', async () => {
  const s = makeStore(); await dev(s, 'create_incident', body());
  assert.equal((await H.handleVideoUrl(s, staffA, 'INC-ABC123', 'front')).status, 404);   // not uploaded yet
  const u = await dev(s, 'upload_url', { incident_id: 'INC-ABC123', side: 'front' });
  assert.equal(u.body.path, 'incidents/A/r1/INC-ABC123/front_accident_video.mp4');
  assert.equal((await dev(s, 'upload_url', { incident_id: 'INC-ABC123', side: 'top' })).status, 400);
  assert.equal((await dev(s, 'upload_complete', { incident_id: 'INC-ABC123', side: 'front' })).body.changed, true);
  assert.equal((await dev(s, 'upload_complete', { incident_id: 'INC-ABC123', side: 'front' })).body.changed, false);
  assert.equal((await H.handleVideoUrl(s, staffB, 'INC-ABC123', 'front')).status, 404);
  const v = await H.handleVideoUrl(s, staffA, 'INC-ABC123', 'front');
  assert.equal(v.status, 200); assert.ok(v.body.url.startsWith('https://read.example/'));
  assert.equal(s.audits.at(-1).action, 'video_access');
  s.devices['vest-2'] = { deviceId: 'vest-2', riderId: 'r9', companyId: 'B', secretHash: H.sha('k2') };
  assert.equal((await dev(s, 'upload_url', { incident_id: 'INC-ABC123', side: 'rear' }, hdr('k2', 'vest-2'))).status, 404);
});
