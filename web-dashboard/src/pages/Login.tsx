import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, useEmulators } from '../lib/firebase';
import { logout, useAuth } from '../lib/auth';
import { friendlyError } from '../lib/actions';
import { Field, Notice } from '../components/ui';

export function Login() {
  const { user, blocked, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  if (!loading && user && !blocked) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err) { setMsg({ tone: 'error', text: friendlyError(err) }); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) { setMsg({ tone: 'error', text: 'Type your company email first, then press "Forgot password".' }); return; }
    try { await sendPasswordResetEmail(auth, email.trim()); setMsg({ tone: 'ok', text: 'If that account exists, a reset link is on its way.' }); }
    catch (err) { setMsg({ tone: 'error', text: friendlyError(err) }); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <img src="/favicon.svg" alt="" width={44} height={44} />
          <div><strong>RideGuard AI</strong><small>Company emergency dashboard</small></div>
        </div>
        {user && blocked && (
          <Notice tone="error">{blocked} <button type="button" className="linkish" onClick={() => logout()}>Sign out</button></Notice>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Field label="Company email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <div className="pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn ghost small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </Field>
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="linkish" onClick={forgot}>Forgot password?</button>
        <p className="muted small">Company accounts are created by your administrator. Riders sign in on the Android app.</p>
        {useEmulators && <p className="muted small">Emulator mode: demo accounts such as admin@rideguard.test (see backend/scripts/seed_demo.js).</p>}
      </form>
    </div>
  );
}
