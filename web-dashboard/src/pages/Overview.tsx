import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { ago, deviceOnline, deviceProblems, isActive, isEmergency, STATUS } from '../lib/format';
import { Empty, Stat, StatusBadge } from '../components/ui';
import { IncidentCard } from '../components/IncidentCard';
import { IncidentMap, type Pin } from '../components/IncidentMap';

export function Overview() {
  const { incidents, users, devices, now } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const riders = users.filter((u) => u.role === 'rider' && u.status === 'active');
  const online = devices.filter((d) => d.active !== false && deviceOnline(d, now));
  const active = incidents.filter(isActive);
  const problems = devices.map((d) => ({ d, p: deviceProblems(d, now) })).filter((x) => x.p.length);
  const recent = incidents.filter((i) => !isActive(i)).slice(0, 6);

  // Only active emergencies are mapped: normal rider locations are never shown.
  const pins: Pin[] = active.filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({ id: i.id, lat: i.latitude!, lng: i.longitude!, label: `${i.riderName} – ${STATUS[i.status].label}`, tone: isEmergency(i) ? 'red' : 'amber' }));

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return incidents.filter((i) => i.incidentId.toLowerCase().includes(s) || (i.riderName || '').toLowerCase().includes(s)).slice(0, 8);
  }, [q, incidents]);

  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <div className="search">
          <input type="search" placeholder="Search rider name or incident number…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((i) => (
                <li key={i.id}><button onClick={() => nav(`/incidents/${i.id}`)}>
                  <strong>{i.incidentId}</strong> {i.riderName} <StatusBadge status={i.status} />
                </button></li>
              ))}
            </ul>
          )}
          {q.trim() && results.length === 0 && <div className="search-results none">No rider or incident matches “{q}”.</div>}
        </div>
      </div>

      <div className="stats">
        <Stat label="Active emergencies" value={active.length} tone={active.length ? 'red' : 'green'} hint={active.length ? 'Needs attention' : 'All clear'} />
        <Stat label="Registered riders" value={riders.length} hint={`${users.filter((u) => u.role === 'rider' && u.status === 'pending').length} awaiting approval`} />
        <Stat label="Connected vests" value={`${online.length} / ${devices.filter((d) => d.active !== false).length}`} tone="green" hint="Seen in the last 2 minutes" />
        <Stat label="Vests with problems" value={problems.length} tone={problems.length ? 'amber' : 'green'} hint="Offline, sensor, camera or battery" />
      </div>

      <section>
        <div className="section-head"><h2>Active emergencies</h2><Link to="/emergencies">See all</Link></div>
        {active.length === 0 ? <Empty>✔ No active emergencies.</Empty> : (
          <div className="two-col">
            <div className="cards">{active.slice(0, 4).map((i) => <IncidentCard key={i.id} i={i} now={now} />)}</div>
            {pins.length > 0 && <IncidentMap pins={pins} height={420} onPick={(id) => nav(`/incidents/${id}`)} />}
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="section-head"><h2>Recent incidents</h2><Link to="/history">History</Link></div>
          {recent.length === 0 ? <Empty>No past incidents.</Empty> : (
            <table className="table">
              <tbody>
                {recent.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => nav(`/incidents/${i.id}`)}>
                    <td><strong>{i.riderName}</strong><div className="muted small">{i.incidentId}</div></td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="muted">{ago(i.createdAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <div className="section-head"><h2>Vests with problems</h2><Link to="/vests">All vests</Link></div>
          {problems.length === 0 ? <Empty>✔ All vests healthy.</Empty> : (
            <table className="table">
              <tbody>
                {problems.map(({ d, p }) => (
                  <tr key={d.id}>
                    <td><strong>{d.label || d.id}</strong><div className="muted small">{users.find((u) => u.id === d.riderId)?.name || 'Unassigned'}</div></td>
                    <td>{p.map((x) => <div key={x} className="problem">⚠ {x}</div>)}</td>
                    <td className="muted small">seen {ago(d.lastSeenAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
