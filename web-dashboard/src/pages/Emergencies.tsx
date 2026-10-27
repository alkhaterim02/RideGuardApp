import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { isActive, isEmergency, STATUS } from '../lib/format';
import { Empty } from '../components/ui';
import { IncidentCard } from '../components/IncidentCard';
import { IncidentMap, type Pin } from '../components/IncidentMap';

export function Emergencies() {
  const { incidents, now } = useData();
  const nav = useNavigate();
  // Unacknowledged emergencies first, then acknowledged, then countdowns; newest first within each.
  const rank = { confirmed: 0, acknowledged: 1, pending: 2, closed: 3, cancelled: 3 };
  const active = incidents.filter(isActive).sort((a, b) => rank[a.status] - rank[b.status]);
  const pins: Pin[] = active.filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({ id: i.id, lat: i.latitude!, lng: i.longitude!, label: `${i.riderName} – ${STATUS[i.status].label}`, tone: isEmergency(i) ? 'red' : 'amber' }));

  return (
    <>
      <div className="page-head"><h1>Active emergencies</h1><span className="muted">Updates live. Unacknowledged emergencies are listed first.</span></div>
      {active.length === 0 ? <Empty>✔ No active emergencies right now.</Empty> : (
        <div className="two-col">
          <div className="cards">{active.map((i) => <IncidentCard key={i.id} i={i} now={now} />)}</div>
          {pins.length > 0 && <div className="sticky"><IncidentMap pins={pins} height={520} onPick={(id) => nav(`/incidents/${id}`)} /></div>}
        </div>
      )}
    </>
  );
}
