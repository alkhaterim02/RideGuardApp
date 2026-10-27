import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import type { EmergencySnapshot, Outcome } from '../lib/types';
import { ago, dateTime, directionsLink, isEmergency, mapsLink, ms, OUTCOMES, smsLabel } from '../lib/format';
import { acknowledgeIncident, audit, closeIncident, friendlyError, loadSnapshot } from '../lib/actions';
import { Badge, Empty, Field, Modal, Notice, SimBadge, StatusBadge } from '../components/ui';
import { IncidentMap } from '../components/IncidentMap';
import { VideoPanel } from '../components/VideoPanel';

const ASSESSMENT: Record<string, string> = {
  rider_down_likely: 'Rider or motorcycle likely down',
  unclear: 'Camera view unclear',
  no_accident_visible: 'No accident visible',
};

export function IncidentDetail() {
  const { id = '' } = useParams();
  const { profile: me } = useAuth();
  const { incidents, users, now, userName } = useData();
  const i = incidents.find((x) => x.id === id);
  const [snap, setSnap] = useState<EmergencySnapshot | null | 'none' | 'hidden'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const viewed = useRef(false);

  const emergency = !!i && isEmergency(i);

  useEffect(() => {
    if (i && me && !viewed.current) { viewed.current = true; audit(me, 'incident_view', { incidentId: i.id }); }
  }, [i, me]);

  useEffect(() => {
    if (!i || !me) return;
    if (!emergency) { setSnap('hidden'); return; }
    let live = true;
    loadSnapshot(i.id, me).then((s) => live && setSnap(s ?? 'none'), () => live && setSnap('none'));
    return () => { live = false; };
  }, [i?.id, emergency, me?.id]);

  if (!i || !me) return <Empty>Incident not found, or you do not have access to it. <Link to="/">Back to overview</Link></Empty>;

  const rider = users.find((u) => u.id === i.riderId);
  const riderPhone = rider?.phone || i.riderPhone;
  const hasLoc = i.latitude != null && i.longitude != null;
  const sms = smsLabel(i.smsStatus);
  const contact = snap && typeof snap === 'object' ? snap : null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  const timeline: [string, string, string?][] = [
    [i.trigger === 'sos' ? 'Manual SOS pressed' : 'Possible accident detected', dateTime(i.createdAt)],
  ];
  if (i.cancelledAt || i.status === 'cancelled') timeline.push(['Cancelled by rider – no alert sent', dateTime(i.cancelledAt)]);
  if (i.confirmedAt) timeline.push(['Emergency confirmed – alert sent', dateTime(i.confirmedAt)]);
  if (i.acknowledgedAt) timeline.push(['Acknowledged', dateTime(i.acknowledgedAt), userName(i.acknowledgedBy)]);
  if (i.closedAt) timeline.push([`Closed – ${i.outcome ? OUTCOMES[i.outcome] : ''}`, dateTime(i.closedAt), userName(i.closedBy)]);

  return (
    <>
      <div className="crumbs"><Link to="/emergencies">← Active emergencies</Link></div>
      <div className={`detail-head ${emergency ? 'urgent' : ''}`}>
        <div>
          <div className="badges"><StatusBadge status={i.status} /><SimBadge show={i.simulated} />
            {i.trigger === 'sos' && <Badge tone="red" icon="🆘">Manual SOS</Badge>}
            {i.source === 'app' && <Badge tone="grey">From rider's phone</Badge>}</div>
          <h1>{i.riderName || 'Unknown rider'}</h1>
          <div className="muted">{i.incidentId} · {dateTime(i.createdAt)} ({ago(i.createdAt, now)})</div>
        </div>
        <div className="actions">
          {riderPhone && <a className="btn" href={`tel:${riderPhone}`}>📞 Call rider</a>}
          {contact?.emergencyContactPhone && <a className="btn" href={`tel:${contact.emergencyContactPhone}`}>📞 Call emergency contact</a>}
          {i.status === 'confirmed' && <button className="btn danger" disabled={busy} onClick={() => act(() => acknowledgeIncident(i.id, me))}>✔ Mark acknowledged</button>}
          {emergency && <button className="btn" disabled={busy} onClick={() => setClosing(true)}>Close incident…</button>}
        </div>
      </div>

      {err && <Notice tone="error">{err}</Notice>}
      {i.simulated && <Notice tone="info">This is a simulation created for testing. No real emergency SMS was sent.</Notice>}
      {i.falseAlarmRequested && <Notice tone="warn">The rider reported this as a false alarm after the alert was sent. Confirm with the rider before closing.</Notice>}
      {i.deletionRequested && <Notice tone="warn">The rider has asked for this incident and its videos to be deleted. Handle it under your data-retention policy.</Notice>}
      {i.status === 'pending' && (
        <Notice tone="warn">Possible accident: the rider has {Math.max(0, Math.ceil((ms(i.createdAt) + (i.countdownSeconds || 20) * 1000 - now) / 1000))}s to cancel before the alert is sent automatically.</Notice>
      )}

      <div className="detail-grid">
        <section className="panel">
          <div className="section-head"><h2>Location</h2>
            {hasLoc && <a className="btn small" href={directionsLink(i.latitude!, i.longitude!)} target="_blank" rel="noreferrer">Directions ↗</a>}</div>
          {hasLoc ? (
            <>
              <IncidentMap pins={[{ id: i.id, lat: i.latitude!, lng: i.longitude!, label: i.riderName || 'Rider', tone: emergency ? 'red' : 'grey' }]} height={300} />
              <p className="muted small">
                {i.latitude!.toFixed(5)}, {i.longitude!.toFixed(5)}{i.locationLastKnown ? ' · last known position (GPS fix pending)' : ''}
                {i.locationUpdatedAt && ` · updated ${ago(i.locationUpdatedAt, now)}`} · <a href={mapsLink(i.latitude!, i.longitude!)} target="_blank" rel="noreferrer">Open in Google Maps</a>
              </p>
            </>
          ) : <Empty>Location pending – the vest keeps requesting a GPS fix.</Empty>}
        </section>

        <section className="panel">
          <h2>Rider and emergency contact</h2>
          <dl className="kv">
            <dt>Rider</dt><dd>{i.riderName}{rider?.riderNumber && <span className="muted"> · {rider.riderNumber}</span>}</dd>
            <dt>Rider phone</dt><dd>{riderPhone ? <a href={`tel:${riderPhone}`}>{riderPhone}</a> : '—'}</dd>
            <dt>Vest</dt><dd>{i.deviceId || 'None (phone alert)'}</dd>
          </dl>
          {snap === 'hidden' ? (
            <p className="muted small">Emergency contact and health details are shown only while an emergency is active.</p>
          ) : snap === null ? <p className="muted">Loading emergency details…</p>
            : snap === 'none' ? <p className="muted small">No emergency details shared (rider has not consented, or no profile).</p>
            : (
              <>
                <h3>Emergency contact</h3>
                <dl className="kv">
                  <dt>Name</dt><dd>{contact!.emergencyContactName || '—'}{contact!.emergencyContactRelationship && ` (${contact!.emergencyContactRelationship})`}</dd>
                  <dt>Phone</dt><dd>{contact!.emergencyContactPhone ? <a href={`tel:${contact!.emergencyContactPhone}`}>{contact!.emergencyContactPhone}</a> : '—'}</dd>
                </dl>
                <h3>Health information <span className="muted small">(viewing is logged)</span></h3>
                <dl className="kv health">
                  <dt>Blood type</dt><dd className="big">{contact!.bloodType || '—'}</dd>
                  <dt>Allergies</dt><dd>{contact!.allergies || '—'}</dd>
                  <dt>Conditions</dt><dd>{contact!.conditions || '—'}</dd>
                  <dt>Medication</dt><dd>{contact!.medication || '—'}</dd>
                  {contact!.age != null && <><dt>Age</dt><dd>{contact!.age}</dd></>}
                </dl>
              </>
            )}
        </section>

        <section className="panel">
          <h2>Alerts</h2>
          <dl className="kv">
            <dt>Emergency SMS</dt><dd><Badge tone={sms.tone}>{sms.text}</Badge></dd>
            <dt>Company notified</dt><dd>{i.companyNotified === 'push_sent' ? 'Push notification sent' : i.companyNotified === 'push_failed' ? 'Push failed – shown on dashboard' : 'Shown on dashboard'}</dd>
          </dl>
          <h3>Timeline</h3>
          <ol className="timeline">
            {timeline.map(([what, when, who]) => <li key={what}><strong>{what}</strong><span className="muted">{when}{who ? ` · ${who}` : ''}</span></li>)}
          </ol>
          {i.closeNote && <p className="note">“{i.closeNote}”</p>}
        </section>

        <section className="panel">
          <h2>Sensor and AI summary</h2>
          {i.trigger === 'sos' && i.peakAccelG == null ? <p className="muted">Manual SOS – not triggered by the motion sensor.</p> : (
            <dl className="kv">
              <dt>Peak impact</dt><dd>{i.peakAccelG != null ? `${i.peakAccelG.toFixed(1)} g` : '—'}</dd>
              <dt>Peak rotation</dt><dd>{i.peakRotationDps != null ? `${Math.round(i.peakRotationDps)} °/s` : '—'}</dd>
              <dt>Tilt after impact</dt><dd>{i.tiltDeg != null ? `${Math.round(i.tiltDeg)}°` : '—'}</dd>
              <dt>AI verification</dt><dd>{i.aiVerificationScore != null ? `${Math.round(i.aiVerificationScore * 100)}%` : 'Not available'}{i.aiAssessment && ` – ${ASSESSMENT[i.aiAssessment] || i.aiAssessment}`}</dd>
            </dl>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Accident videos</h2>
        <div className="videos">
          <VideoPanel incident={i} side="front" me={me} />
          <VideoPanel incident={i} side="rear" me={me} />
        </div>
      </section>

      {closing && <CloseDialog onClose={() => setClosing(false)} onConfirm={(o, note) => act(async () => { await closeIncident(i.id, me, o, note); setClosing(false); })} busy={busy} />}
    </>
  );
}

function CloseDialog({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: (o: Outcome, note: string) => void; busy: boolean }) {
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  return (
    <Modal title="Close this active emergency?" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Keep open</button>
      <button className="btn danger" disabled={!outcome || !sure || busy} onClick={() => outcome && onConfirm(outcome, note)}>Yes, close incident</button>
    </>}>
      <p>Close it only after the rider is safe or help has arrived. Closed incidents move to history and health details are hidden.</p>
      <Field label="Outcome">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} required>
          <option value="">Choose…</option>
          {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I confirm this emergency is resolved.</label>
    </Modal>
  );
}
