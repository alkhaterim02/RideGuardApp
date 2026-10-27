import { Link } from 'react-router-dom';
import type { Incident } from '../lib/types';
import { ago, dateTime, isEmergency, ms, smsLabel, videoLabel } from '../lib/format';
import { Badge, SimBadge, StatusBadge } from './ui';

function videoSummary(i: Incident) {
  const f = i.frontVideoUploadStatus, r = i.rearVideoUploadStatus;
  if (!f && !r) return videoLabel(undefined);
  if (f === 'uploaded' && r === 'uploaded') return { text: 'Both videos ready', tone: 'green' as const };
  if (f === 'failed' || r === 'failed') return { text: 'A video upload failed', tone: 'red' as const };
  if (f === 'uploaded' || r === 'uploaded') return { text: 'One video ready, one pending', tone: 'amber' as const };
  return videoLabel(f || r);
}

export function IncidentCard({ i, now }: { i: Incident; now: number }) {
  const v = videoSummary(i);
  const sms = smsLabel(i.smsStatus);
  const deadline = i.status === 'pending' && i.createdAt ? ms(i.createdAt) + (i.countdownSeconds || 20) * 1000 : 0;
  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  return (
    <article className={`icard ${isEmergency(i) ? 'urgent' : i.status === 'pending' ? 'warn' : ''}`}>
      <div className="icard-top">
        <StatusBadge status={i.status} />
        <SimBadge show={i.simulated} />
        {i.trigger === 'sos' && <Badge tone="red" icon="🆘">Manual SOS</Badge>}
        {i.falseAlarmRequested && <Badge tone="amber" icon="!">Rider reported false alarm</Badge>}
      </div>
      <h3>{i.riderName || 'Unknown rider'}</h3>
      <div className="icard-meta">
        <span>{i.incidentId}</span>
        <span title={dateTime(i.createdAt)}>{dateTime(i.createdAt)} · {ago(i.createdAt, now)}</span>
        <span>
          {i.latitude != null && i.longitude != null
            ? `${i.latitude.toFixed(4)}, ${i.longitude.toFixed(4)}${i.locationLastKnown ? ' (last known)' : ''}`
            : 'Location pending'}
        </span>
      </div>
      {i.status === 'pending' && (
        <p className="icard-note">{left > 0 ? `Rider can still cancel: ${left}s left` : 'Countdown ended – waiting for the vest to confirm'}</p>
      )}
      <div className="icard-foot">
        <Badge tone={sms.tone}>SMS: {sms.text}</Badge>
        <Badge tone={v.tone}>Video: {v.text}</Badge>
        <Link className={`btn ${isEmergency(i) ? 'danger' : ''}`} to={`/incidents/${i.id}`}>View emergency</Link>
      </div>
    </article>
  );
}
