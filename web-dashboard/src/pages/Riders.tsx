import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import type { UserDoc } from '../lib/types';
import { ago, deviceOnline, deviceProblems } from '../lib/format';
import { addRider, assignVest, friendlyError, resetPassword, setRiderStatus } from '../lib/actions';
import { Empty, Field, Modal, Notice } from '../components/ui';

export function Riders() {
  const { profile: me } = useAuth();
  const { users, devices, now } = useData();
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown> } | null>(null);
  const [filter, setFilter] = useState<'active' | 'pending' | 'inactive'>('active');

  if (!me) return null;
  const riders = users.filter((u) => u.role === 'rider').sort((a, b) => a.name.localeCompare(b.name));
  const counts = { active: 0, pending: 0, inactive: 0 };
  riders.forEach((r) => counts[r.status]++);
  const shown = riders.filter((r) => r.status === filter);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'error', text: friendlyError(e) }); }
  };

  const vestCell = (r: UserDoc) => {
    const d = devices.find((x) => x.id === r.deviceId);
    const free = devices.filter((x) => x.active !== false && (!x.riderId || x.id === r.deviceId));
    return (
      <div>
        <select value={r.deviceId || ''} aria-label={`Vest for ${r.name}`} disabled={r.status !== 'active'}
          onChange={(e) => run(() => assignVest(me, r, e.target.value || null, users.find((u) => u.deviceId === e.target.value)), `Vest updated for ${r.name}.`)}>
          <option value="">No vest</option>
          {free.map((x) => <option key={x.id} value={x.id}>{x.label || x.id}</option>)}
        </select>
        {d && (deviceOnline(d, now)
          ? <div className="small ok-text">● Online{deviceProblems(d, now).length ? ` · ${deviceProblems(d, now).join(', ')}` : ''}</div>
          : <div className="small muted">○ Offline · seen {ago(d.lastSeenAt, now)}</div>)}
      </div>
    );
  };

  return (
    <>
      <div className="page-head"><h1>Riders</h1><button className="btn primary" onClick={() => setAdding(true)}>+ Add rider</button></div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="tabs">
        {(['active', 'pending', 'inactive'] as const).map((k) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {k === 'active' ? 'Active' : k === 'pending' ? 'Awaiting approval' : 'Inactive'} ({counts[k]})
          </button>
        ))}
      </div>
      {filter === 'pending' && counts.pending > 0 && <p className="muted">These riders registered in the app with your company join code. Approve them only if you recognise them.</p>}
      {shown.length === 0 ? <Empty>No {filter === 'pending' ? 'riders awaiting approval' : `${filter} riders`}.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Rider</th><th>Contact</th><th>Vest</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><div className="muted small">{r.riderNumber || 'No rider ID'}</div></td>
                  <td className="small">{r.email}<div>{r.phone || '—'}</div></td>
                  <td>{vestCell(r)}</td>
                  <td className="row-actions">
                    {r.status === 'pending' && <button className="btn small primary" onClick={() => run(() => setRiderStatus(me, r, 'active'), `${r.name} approved.`)}>Approve</button>}
                    {r.status === 'pending' && <button className="btn small" onClick={() => run(() => setRiderStatus(me, r, 'inactive'), `${r.name} rejected.`)}>Reject</button>}
                    {r.status === 'active' && <button className="btn small" onClick={() => setConfirm({ title: `Deactivate ${r.name}?`,
                      body: 'They will no longer be able to sign in to the app, and their vest is unassigned. Their incident history is kept.',
                      run: async () => { if (r.deviceId) await assignVest(me, r, null); await setRiderStatus(me, r, 'inactive'); } })}>Deactivate</button>}
                    {r.status === 'inactive' && <button className="btn small" onClick={() => run(() => setRiderStatus(me, r, 'active'), `${r.name} re-activated.`)}>Re-activate</button>}
                    <button className="btn small ghost" onClick={() => setConfirm({ title: `Send password reset to ${r.email}?`,
                      body: 'The rider receives an email with a link to choose a new password.', run: () => resetPassword(r.email) })}>Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddRider onClose={() => setAdding(false)} onDone={(name) => { setAdding(false); setMsg({ tone: 'ok', text: `${name} added. Give them their email and temporary password.` }); }} />}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)} footer={<>
          <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn primary" onClick={() => { const c = confirm; setConfirm(null); run(c.run, 'Done.'); }}>Confirm</button>
        </>}><p>{confirm.body}</p></Modal>
      )}
    </>
  );
}

function AddRider({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const { profile: me } = useAuth();
  const { devices } = useData();
  const [f, setF] = useState({ name: '', email: '', phone: '', riderNumber: '', password: '', deviceId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const free = devices.filter((d) => d.active !== false && !d.riderId);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    if (f.password.length < 8) { setErr('Use a temporary password of at least 8 characters.'); return; }
    setBusy(true); setErr(null);
    try { await addRider(me, { ...f, deviceId: f.deviceId || null }); onDone(f.name); }
    catch (x) { setErr(friendlyError(x)); setBusy(false); }
  };

  return (
    <Modal title="Add a rider" onClose={onClose}>
      <form onSubmit={submit} className="form">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Full name"><input required value={f.name} onChange={set('name')} /></Field>
        <div className="row2">
          <Field label="Email"><input type="email" required value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input type="tel" required value={f.phone} onChange={set('phone')} placeholder="+353 87 …" /></Field>
        </div>
        <div className="row2">
          <Field label="Rider ID"><input value={f.riderNumber} onChange={set('riderNumber')} placeholder="R-1004" /></Field>
          <Field label="Vest">
            <select value={f.deviceId} onChange={set('deviceId')}>
              <option value="">Assign later</option>
              {free.map((d) => <option key={d.id} value={d.id}>{d.label || d.id}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Temporary password" hint="The rider adds health details and an emergency contact in the app, and can change this password via “Forgot password”.">
          <input type="text" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add rider'}</button>
        </div>
      </form>
    </Modal>
  );
}
