import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

export interface Pin { id: string; lat: number; lng: number; label: string; tone: 'red' | 'amber' | 'grey' }

const COLORS = { red: '#B3241B', amber: '#C27803', grey: '#6B7486' };

function Fit({ pins }: { pins: Pin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 16);
    else if (pins.length > 1) map.fitBounds(pins.map((p) => [p.lat, p.lng] as [number, number]), { padding: [30, 30], maxZoom: 15 });
  }, [map, pins]);
  return null;
}

/** OpenStreetMap tiles: no API key needed. */
export function IncidentMap({ pins, height = 320, onPick }: { pins: Pin[]; height?: number; onPick?: (id: string) => void }) {
  const center: [number, number] = pins.length ? [pins[0].lat, pins[0].lng] : [53.3498, -6.2603];
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pins.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={p.tone === 'grey' ? 7 : 11}
            pathOptions={{ color: '#fff', weight: 3, fillColor: COLORS[p.tone], fillOpacity: 1 }}
            eventHandlers={onPick ? { click: () => onPick(p.id) } : undefined}>
            <Tooltip direction="top" offset={[0, -8]} permanent={pins.length === 1}>{p.label}</Tooltip>
          </CircleMarker>
        ))}
        <Fit pins={pins} />
      </MapContainer>
    </div>
  );
}
