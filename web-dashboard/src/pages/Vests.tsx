import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import type { Device } from '../lib/types';
import { ago, deviceOnline, deviceProblems } from '../lib/format';
import { addVest, friendlyError, setVestActive } from '../lib/actions';
import { Badge, Empty, Field, Modal, Notice } from '../components/ui';

const PARTS: [keyof NonNullable<Device['status']>, string][] = [['imu', 'Motion'], ['frontCamera', 'Camera'], ['lte', '4G'], ['gnss', 'GPS']];

export function Vests() {
  const { profile: me } = useAuth();
  const { devices, users, now } = useData();
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  if (!me) return null;
  const sorted = [...devices].sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'error', text: friendlyError(e) }); }
  };

  return (
    <>
      <div className="page-head"><h1>Vests</h1><button className="btn primary" onClick={() => setAdding(true)}>+ Register vest</button></div>
      <p className="muted">Vests report their health every few seconds while switched on. Riders' locations are never shown here – only during an emergency.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {sorted.length === 0 ? <Empty>No vests registered yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vest</th><th>Rider</th><th>Connection</th><th>Battery</th><th>Components</th><th></th></tr></thead>
            <tbody>
              {sorted.map((d) => {
                const on = deviceOnline(d, now);
                const s = d.status || {};
                const rider = users.find((u) => u.id === d.riderId);
                return (
                  <tr key={d.id} className={d.active === false ? 'dim' : ''}>
                    <td><strong>{d.label || d.id}</strong><div className="muted small">{d.id}</div></td>
                    <td>{rider?.name || <span className="muted">Unassigned</span>}</td>
                    <td>{d.active === false ? <Badge tone="grey">Retired</Badge> : on
                      ? <Badge tone="green" icon="●">Online</Badge>
                      : <Badge tone="grey" icon="○">Offline · {ago(d.lastSeenAt, now)}</Badge>}</td>
                    <td>{on && typeof s.battery === 'number' ? <Badge tone={s.battery < 20 ? 'red' : s.battery < 40 ? 'amber' : 'green'}>{s.battery}%</Badge> : '—'}</td>
                    <td className="parts">{on ? PARTS.map(([k, label]) => (
                      <span key={k} className={`part ${s[k] && s[k] !== 'ok' ? 'bad' : 'good'}`} title={`${label}: ${s[k] || 'unknown'}`}>
                        {s[k] && s[k] !== 'ok' ? '✕' : '✓'} {label}
                      </span>)) : <span className="muted small">{deviceProblems(d, now).join(', ') || '—'}</span>}</td>
                    <td>{d.active === false
                      ? <button className="btn small" onClick={() => run(() => setVestActive(d.id, true), 'Vest re-activated.')}>Re-activate</button>
                      : !d.riderId && <button className="btn small ghost" onClick={() => run(() => setVestActive(d.id, false), 'Vest retired.')}>Retire</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddVest onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); setMsg({ tone: 'ok', text: `Vest ${id} registered. Run backend/scripts/provision_device.js to give it its secret.` }); }} />}
    </>
  );
}

function AddVest({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { profile: me } = useAuth();
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const clean = id.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,32}$/.test(clean)) { setErr('Use 3–32 lowercase letters, digits or dashes, e.g. vest-004.'); return; }
    try { await addVest(me, clean, label); onDone(clean); } catch (x) { setErr(friendlyError(x)); }
  };
  return (
    <Modal title="Register a vest" onClose={onClose}>
      <form onSubmit={submit} className="form">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Vest ID" hint="Printed on the vest's Raspberry Pi enclosure (RIDEGUARD_DEVICE_ID)."><input required value={id} onChange={(e) => setId(e.target.value)} placeholder="vest-004" /></Field>
        <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vest 004 – size L" /></Field>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary">Register</button>
        </div>
      </form>
    </Modal>
  );
}
