import { useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { addStaff, createJoinCode, deleteJoinCode, friendlyError, randomCode, setStaffStatus, updateCompany } from '../lib/actions';
import { Badge, Field, Modal, Notice } from '../components/ui';

export function Settings() {
  const { profile: me } = useAuth();
  const { company, users } = useData();
  const [name, setName] = useState(company?.name || '');
  const [secs, setSecs] = useState(company?.countdownSeconds || 20);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);

  useEffect(() => { setName(company?.name || ''); setSecs(company?.countdownSeconds || 20); }, [company]);
  if (!me || !company) return null;
  const staff = users.filter((u) => u.role !== 'rider');

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'error', text: friendlyError(e) }); }
  };

  const save = (e: FormEvent) => { e.preventDefault(); run(() => updateCompany(company.id, { name: name.trim(), countdownSeconds: secs }), 'Settings saved.'); };

  const checkCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const s = await getDoc(doc(db, 'companyCodes', c)).catch(() => null);
    setCodeStatus(s?.exists() ? (s.data().companyId === me.companyId ? 'Active – riders can register with it.' : 'Used by another company.') : 'Not active.');
  };

  return (
    <>
      <div className="page-head"><h1>Company settings</h1></div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="two-col">
        <section className="panel">
          <h2>Company</h2>
          <form onSubmit={save} className="form">
            <Field label="Company name"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Cancel countdown (seconds)" hint="How long riders have to cancel a possible accident before the alert is sent (15–20 s recommended).">
              <input type="number" min={10} max={60} value={secs} onChange={(e) => setSecs(Number(e.target.value))} />
            </Field>
            <button className="btn primary">Save</button>
          </form>
        </section>
        <section className="panel">
          <h2>Rider join code</h2>
          <p className="muted small">Riders type this code when they register in the app. New registrations wait for approval under Riders → Awaiting approval. Codes cannot be listed, so keep a note of yours.</p>
          <div className="inline">
            <input value={code} onChange={(e) => { setCode(e.target.value); setCodeStatus(null); }} placeholder="RIDE-XXXX-XX" aria-label="Join code" />
            <button className="btn small" onClick={checkCode}>Check</button>
          </div>
          {codeStatus && <p className="small">{codeStatus}</p>}
          <div className="inline">
            <button className="btn small primary" onClick={() => { const c = randomCode(); setCode(c); run(() => createJoinCode(me, c, company.name), `New join code ${c} is active.`); }}>Create new code</button>
            {code.trim() && <button className="btn small ghost" onClick={() => run(() => deleteJoinCode(code.trim().toUpperCase()), `Code ${code.trim().toUpperCase()} disabled.`)}>Disable this code</button>}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-head"><h2>Staff accounts</h2><button className="btn small primary" onClick={() => setAddingStaff(true)}>+ Add staff</button></div>
        <table className="table">
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong><div className="muted small">{s.email}</div></td>
                <td><Badge tone={s.role === 'company_admin' ? 'blue' : 'grey'}>{s.role === 'company_admin' ? 'Administrator' : 'Staff'}</Badge></td>
                <td>{s.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="grey">Inactive</Badge>}</td>
                <td>{s.role === 'company_staff' && (s.status === 'active'
                  ? <button className="btn small ghost" onClick={() => run(() => setStaffStatus(s.id, 'inactive'), `${s.name} deactivated.`)}>Deactivate</button>
                  : <button className="btn small" onClick={() => run(() => setStaffStatus(s.id, 'active'), `${s.name} re-activated.`)}>Re-activate</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {addingStaff && <AddStaff onClose={() => setAddingStaff(false)} onDone={(n) => { setAddingStaff(false); setMsg({ tone: 'ok', text: `${n} can now sign in to the dashboard.` }); }} />}
    </>
  );
}

function AddStaff({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const { profile: me } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setBusy(true); setErr(null);
    try { await addStaff(me, f); onDone(f.name); } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  };
  return (
    <Modal title="Add a staff member" onClose={onClose}>
      <form onSubmit={submit} className="form">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Full name"><input required value={f.name} onChange={set('name')} /></Field>
        <div className="row2">
          <Field label="Email"><input type="email" required value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="Temporary password"><input required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add staff'}</button>
        </div>
      </form>
    </Modal>
  );
}
