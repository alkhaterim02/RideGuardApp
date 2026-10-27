import { useEffect, useState } from 'react';
import type { Incident, UserDoc } from '../lib/types';
import { videoLabel } from '../lib/format';
import { friendlyError, loadVideo } from '../lib/actions';
import { Badge } from './ui';

/** One accident clip. Loaded only on request (it is sensitive and large) and each view is audited. */
export function VideoPanel({ incident, side, me }: { incident: Incident; side: 'front' | 'rear'; me: UserDoc }) {
  const status = side === 'front' ? incident.frontVideoUploadStatus : incident.rearVideoUploadStatus;
  const path = side === 'front' ? incident.frontVideoPath : incident.rearVideoPath;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const l = videoLabel(status);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async () => {
    if (!path) return;
    setBusy(true); setErr(null);
    try { setUrl(await loadVideo(path, incident.id, side, me)); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="video">
      <div className="video-head">
        <strong>{side === 'front' ? 'Front camera' : 'Rear camera'}</strong>
        <Badge tone={l.tone}>{l.text}</Badge>
      </div>
      {url ? (
        <video src={url} controls autoPlay playsInline />
      ) : (
        <div className="video-placeholder">
          {status === 'uploaded' && path ? (
            <button className="btn" onClick={load} disabled={busy}>{busy ? 'Loading video…' : '▶ Load and play'}</button>
          ) : status === 'uploading' || status === 'pending' ? (
            <span>The vest uploads the 30-second clip after the SMS and alert are sent. It appears here automatically.</span>
          ) : status === 'failed' ? (
            <span>Upload failed. The vest keeps the clip on its memory card and retries when 4G returns.</span>
          ) : (
            <span>No clip for this incident.</span>
          )}
        </div>
      )}
      {err && <div className="field-error">{err}</div>}
    </div>
  );
}
