import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import type { Company, Device, Incident, UserDoc } from './types';
import { isActive, ms } from './format';

interface Data {
  ready: boolean;
  error: string | null;
  company: Company | null;
  incidents: Incident[];
  users: UserDoc[];
  devices: Device[];
  /** Live clock (1 s) so "x min ago", countdowns and online status stay current. */
  now: number;
  /** Confirmed emergencies that arrived while the dashboard was open and nobody has looked at yet. */
  alerts: Incident[];
  dismissAlert: (id: string) => void;
  userName: (uid?: string | null) => string;
}

const Ctx = createContext<Data | null>(null);
export function useData() {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData outside DataProvider');
  return d;
}

/** Short two-tone alarm via Web Audio (no sound file needed). Browsers only allow it after a user click on the page. */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.18, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* audio not available */ }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const companyId = profile?.companyId;
  const [company, setCompany] = useState<Company | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loaded, setLoaded] = useState({ inc: false, users: false, dev: false });
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [alerts, setAlerts] = useState<Incident[]>([]);
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!companyId) return;
    const fail = (what: string) => (e: Error) => setError(`Could not load ${what}: ${e.message}`);
    const unsubs = [
      onSnapshot(doc(db, 'companies', companyId), (s) => setCompany(s.exists() ? ({ id: s.id, ...s.data() } as Company) : null), fail('company')),
      onSnapshot(query(collection(db, 'incidents'), where('companyId', '==', companyId), orderBy('createdAt', 'desc'), limit(500)), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Incident);
        // Raise an alarm for incidents that become confirmed after the first load.
        const prev = seen.current;
        const fresh = prev ? list.filter((i) => i.status === 'confirmed' && prev.get(i.id) !== 'confirmed') : [];
        seen.current = new Map(list.map((i) => [i.id, i.status]));
        if (fresh.length) {
          setAlerts((a) => [...fresh, ...a.filter((x) => !fresh.some((f) => f.id === x.id))]);
          beep();
          if ('Notification' in window && Notification.permission === 'granted') {
            for (const i of fresh) new Notification(`Emergency${i.simulated ? ' (simulation)' : ''}: ${i.riderName || 'rider'}`, { body: 'Open RideGuard to respond.', tag: i.id });
          }
        }
        setIncidents(list);
        setLoaded((l) => ({ ...l, inc: true }));
      }, fail('incidents')),
      onSnapshot(query(collection(db, 'users'), where('companyId', '==', companyId)), (s) => {
        setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDoc));
        setLoaded((l) => ({ ...l, users: true }));
      }, fail('users')),
      onSnapshot(query(collection(db, 'devices'), where('companyId', '==', companyId)), (s) => {
        setDevices(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Device));
        setLoaded((l) => ({ ...l, dev: true }));
      }, fail('vests')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  // Drop alerts once the incident is no longer an unacknowledged emergency.
  useEffect(() => {
    setAlerts((a) => a.filter((x) => incidents.find((i) => i.id === x.id)?.status === 'confirmed'));
  }, [incidents]);

  const value = useMemo<Data>(() => {
    const names = new Map(users.map((u) => [u.id, u.name]));
    const sorted = [...incidents].sort((a, b) =>
      isActive(a) !== isActive(b) ? (isActive(a) ? -1 : 1) : ms(b.createdAt) - ms(a.createdAt));
    return {
      ready: loaded.inc && loaded.users && loaded.dev,
      error, company, incidents: sorted, users, devices, now, alerts,
      dismissAlert: (id) => setAlerts((a) => a.filter((x) => x.id !== id)),
      userName: (uid) => (uid ? names.get(uid) || 'Unknown user' : '—'),
    };
  }, [loaded, error, company, incidents, users, devices, now, alerts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
