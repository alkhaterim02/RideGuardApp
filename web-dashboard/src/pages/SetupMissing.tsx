export function SetupMissing() {
  return (
    <div className="login-page">
      <div className="login-card wide">
        <h1>Firebase is not configured yet</h1>
        <p>The dashboard needs your Firebase project's web settings.</p>
        <ol>
          <li>Firebase console → Project settings → <em>Your apps</em> → add a <strong>Web app</strong>.</li>
          <li>Copy <code>web-dashboard/.env.example</code> to <code>web-dashboard/.env.local</code> and paste the values.</li>
          <li>Restart <code>npm run dev</code>.</li>
        </ol>
        <p className="muted">To try it without a project, set <code>VITE_USE_EMULATORS=1</code> and run the Firebase emulators (see docs/FIREBASE_SETUP.md).</p>
      </div>
    </div>
  );
}
