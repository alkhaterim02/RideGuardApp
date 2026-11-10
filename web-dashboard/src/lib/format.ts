import type { Timestamp } from 'firebase/firestore';
import type { Device, Incident, IncidentStatus, Outcome, VideoStatus } from './types';

export const ms = (t?: Timestamp | null) => (t ? t.toMillis() : 0);

export function dateTime(t?: Timestamp | null) {
  if (!t) return '—';
  return t.toDate().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ago(t?: Timestamp | null, now = Date.now()) {
  if (!t) return '—';
  const s = Math.max(0, Math.round((now - t.toMillis()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export type Tone = 'red' | 'amber' | 'green' | 'grey' | 'blue';

/** Every status has text and an icon, never colour alone. */
export const STATUS: Record<IncidentStatus, { label: string; icon: string; tone: Tone }> = {
  pending: { label: 'Possible accident – countdown', icon: '◔', tone: 'amber' },
  confirmed: { label: 'Emergency – needs response', icon: '⚠', tone: 'red' },
  acknowledged: { label: 'Acknowledged – in progress', icon: '●', tone: 'red' },
  closed: { label: 'Closed', icon: '■', tone: 'grey' },
  cancelled: { label: 'Cancelled – false alarm', icon: '✕', tone: 'grey' },
};

export const isActive = (i: Incident) => i.status === 'confirmed' || i.status === 'acknowledged' || i.status === 'pending';
export const isEmergency = (i: Incident) => i.status === 'confirmed' || i.status === 'acknowledged';

export function smsLabel(s?: string): { text: string; tone: Tone } {
  switch (s) {
    case 'accepted': return { text: 'Sent by vest (accepted by network)', tone: 'green' };
    case 'delivered': return { text: 'Delivered', tone: 'green' };
    case 'failed': return { text: 'Failed – vest is retrying', tone: 'red' };
    case 'not_sent': return { text: 'Not sent (cancelled)', tone: 'grey' };
    case 'simulated': return { text: 'Simulated – no SMS sent', tone: 'blue' };
    case 'no_vest': return { text: 'Not sent – phone SOS without vest', tone: 'amber' };
    case 'pending': return { text: 'Sending…', tone: 'amber' };
    default: return { text: s || 'Unknown', tone: 'grey' };
  }
}

export function videoLabel(s?: VideoStatus): { text: string; tone: Tone } {
  switch (s) {
    case 'uploaded': return { text: 'Uploaded', tone: 'green' };
    case 'uploading': return { text: 'Uploading…', tone: 'amber' };
    case 'pending': return { text: 'Waiting for upload', tone: 'amber' };
    case 'failed': return { text: 'Upload failed – will retry', tone: 'red' };
    case 'none': return { text: 'Not recorded', tone: 'grey' };
    default: return { text: 'No video (phone alert)', tone: 'grey' };
  }
}

export const OUTCOMES: Record<Outcome, string> = {
  rider_safe: 'Rider safe – no help needed',
  help_arrived: 'Help arrived on scene',
  hospital: 'Rider taken to hospital',
  false_alarm: 'False alarm',
  other: 'Other (see note)',
};

export const ONLINE_MS = 2 * 60 * 1000;
export const deviceOnline = (d: Device, now = Date.now()) => !!d.lastSeenAt && now - d.lastSeenAt.toMillis() < ONLINE_MS;

export function deviceProblems(d: Device, now = Date.now()): string[] {
  const p: string[] = [];
  if (d.active === false) return p;
  if (!deviceOnline(d, now)) p.push('Offline');
  const s = d.status || {};
  const parts: [keyof typeof s, string][] = [['imu', 'Motion sensor'], ['frontCamera', 'Front camera'], ['lte', '4G'], ['gnss', 'GPS']];
  for (const [k, name] of parts) if (s[k] && s[k] !== 'ok') p.push(`${name}: ${s[k]}`);
  if (typeof s.battery === 'number' && s.battery < 20 && deviceOnline(d, now)) p.push(`Battery ${s.battery}%`);
  return p;
}

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
