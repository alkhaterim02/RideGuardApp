import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, logout } from '../lib/auth';
import { useData } from '../lib/data';
import { deviceProblems, isActive } from '../lib/format';
import { useEmulators } from '../lib/firebase';
import { Spinner, Notice } from './ui';

export function Layout() {
  const { profile, isAdmin } = useAuth();
  const { ready, error, company, incidents, users, devices, alerts, dismissAlert, now } = useData();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  const active = incidents.filter(isActive).length;
  const pendingRiders = users.filter((u) => u.role === 'rider' && u.status === 'pending').length;
  const vestIssues = devices.filter((d) => deviceProblems(d, now).length > 0).length;

  const link = (to: string, label: string, count?: number, tone = '') => (
    <NavLink to={to} end={to === '/'} onClick={() => setMenu(false)} className={({ isActive: a }) => (a ? 'active' : '')}>
      <span>{label}</span>{!!count && <span className={`count ${tone}`}>{count}</span>}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className={`side ${menu ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.png" alt="" width={36} height={36} />
          <div><strong>RideGuard</strong><small>{company?.name || 'Company dashboard'}</small></div>
        </div>
        <nav>
          {link('/', 'Overview')}
          {link('/emergencies', 'Active emergencies', active, 'red')}
          {link('/history', 'Emergency history')}
          {link('/riders', 'Riders', pendingRiders, 'amber')}
          {link('/vests', 'Vests', vestIssues, 'amber')}
          {isAdmin && link('/settings', 'Company settings')}
          {isAdmin && link('/audit', 'Access log')}
        </nav>
        <div className="side-foot">
          {useEmulators && <div className="emu">Local emulator data</div>}
          <div className="me"><strong>{profile?.name}</strong><small>{profile?.role === 'company_admin' ? 'Administrator' : 'Staff'}</small></div>
          <button className="btn ghost small" onClick={() => logout().then(() => nav('/login'))}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn ghost small menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <div className="topbar-fill" />
          {notif !== 'granted' && notif !== 'denied' && (
            <button className="btn small" onClick={async () => setNotif(await Notification.requestPermission())}>
              🔔 Enable emergency alerts
            </button>
          )}
        </header>

        {alerts.map((a) => (
          <div className="alarm" key={a.id} role="alert">
            <span className="alarm-icon" aria-hidden>⚠</span>
            <div className="alarm-text">
              <strong>New emergency{a.simulated ? ' (simulation)' : ''}: {a.riderName || 'Rider'}</strong>
              <span>{a.trigger === 'sos' ? 'Manual SOS' : 'Accident detected'} · {a.incidentId} · not yet acknowledged</span>
            </div>
            <button className="btn danger" onClick={() => { dismissAlert(a.id); nav(`/incidents/${a.id}`); }}>Open emergency</button>
            <button className="btn ghost small light" onClick={() => dismissAlert(a.id)} aria-label="Hide this banner">Hide</button>
          </div>
        ))}

        <main className="content">
          {error && <Notice tone="error">{error}</Notice>}
          {ready ? <Outlet /> : <Spinner label="Loading company data…" />}
        </main>
      </div>
    </div>
  );
}
