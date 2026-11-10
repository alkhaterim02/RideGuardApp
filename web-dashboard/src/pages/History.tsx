import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import type { IncidentStatus } from '../lib/types';
import { dateTime, OUTCOMES, smsLabel, STATUS } from '../lib/format';
import { Badge, Empty, SimBadge, StatusBadge } from '../components/ui';

function csvCell(v: unknown) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export function History() {
  const { incidents, users } = useData();
  const nav = useNavigate();
  const [status, setStatus] = useState<IncidentStatus | 'all'>('all');
  const [rider, setRider] = useState('all');
  const [q, setQ] = useState('');
  const [sim, setSim] = useState(true);

  const riders = users.filter((u) => u.role === 'rider').sort((a, b) => a.name.localeCompare(b.name));
  const rows = useMemo(() => incidents.filter((i) =>
    (status === 'all' || i.status === status) && (rider === 'all' || i.riderId === rider) && (sim || !i.simulated)
    && (!q.trim() || `${i.incidentId} ${i.riderName}`.toLowerCase().includes(q.trim().toLowerCase()))), [incidents, status, rider, q, sim]);

  const exportCsv = () => {
    const head = ['incident', 'rider', 'created', 'status', 'trigger', 'simulated', 'latitude', 'longitude', 'sms', 'video', 'outcome', 'note'];
    const lines = rows.map((i) => [i.incidentId, i.riderName, i.createdAt?.toDate().toISOString(), i.status, i.trigger, i.simulated ? 'yes' : 'no',
      i.latitude, i.longitude, i.smsStatus, i.frontVideoUploadStatus, i.outcome, i.closeNote].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `rideguard-incidents-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-head"><h1>Emergency history</h1><button className="btn small" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div>
      <div className="filters">
        <input type="search" placeholder="Incident number or rider…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus | 'all')} aria-label="Status">
          <option value="all">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={rider} onChange={(e) => setRider(e.target.value)} aria-label="Rider">
          <option value="all">All riders</option>
          {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Include simulations</label>
      </div>
      {rows.length === 0 ? <Empty>No incidents match these filters.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Rider</th><th>Status</th><th>Location</th><th>Alert</th><th>Video</th><th>Result</th></tr></thead>
            <tbody>
              {rows.map((i) => {
                const sms = smsLabel(i.smsStatus);
                return (
                  <tr key={i.id} className="clickable" onClick={() => nav(`/incidents/${i.id}`)}>
                    <td>{dateTime(i.createdAt)}<div className="muted small">{i.incidentId}</div></td>
                    <td><strong>{i.riderName}</strong>{i.trigger === 'sos' && <div className="small">🆘 Manual SOS</div>}</td>
                    <td><StatusBadge status={i.status} /> <SimBadge show={i.simulated} /></td>
                    <td className="small">{i.latitude != null ? `${i.latitude.toFixed(4)}, ${i.longitude?.toFixed(4)}` : '—'}</td>
                    <td><Badge tone={sms.tone}>{sms.text}</Badge></td>
                    <td className="small">{i.frontVideoUploadStatus === 'uploaded' ? 'Ready' : 'None'}</td>
                    <td className="small">{i.outcome ? OUTCOMES[i.outcome] : i.status === 'cancelled' ? 'False alarm (cancelled)' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
