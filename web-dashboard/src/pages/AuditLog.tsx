import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { AuditLog as Log } from '../lib/types';
import { dateTime } from '../lib/format';
import { friendlyError } from '../lib/actions';
import { Empty, Notice, Spinner } from '../components/ui';

const LABEL: Record<string, string> = {
  incident_view: 'Opened incident', medical_access: 'Viewed health details', video_access: 'Played video',
  rider_added: 'Added rider', rider_updated: 'Changed rider', device_updated: 'Changed vest assignment',
};

export function AuditLog() {
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<Log[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    getDocs(query(collection(db, 'auditLogs'), where('companyId', '==', me.companyId), orderBy('at', 'desc'), limit(300)))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Log)), (e) => setErr(friendlyError(e)));
  }, [me]);

  return (
    <>
      <div className="page-head"><h1>Access log</h1><span className="muted">Who viewed sensitive incident data (latest 300).</span></div>
      {err && <Notice tone="error">{err}</Notice>}
      {!rows ? (!err && <Spinner />) : rows.length === 0 ? <Empty>No access recorded yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Incident</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.at)}</td>
                  <td>{r.byName || r.by}</td>
                  <td>{LABEL[r.action] || r.action}{r.side ? ` (${r.side})` : ''}</td>
                  <td>{r.incidentId ? <Link to={`/incidents/${r.incidentId}`}>{r.incidentId}</Link> : '—'}</td>
                  <td className="small muted">{r.detail || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
