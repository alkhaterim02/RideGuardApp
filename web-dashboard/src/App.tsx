import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { firebaseConfigured } from './lib/firebase';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Emergencies } from './pages/Emergencies';
import { IncidentDetail } from './pages/IncidentDetail';
import { History } from './pages/History';
import { Riders } from './pages/Riders';
import { Vests } from './pages/Vests';
import { Settings } from './pages/Settings';
import { AuditLog } from './pages/AuditLog';
import { SetupMissing } from './pages/SetupMissing';

function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { loading, user, blocked, isAdmin } = useAuth();
  if (loading) return <Spinner label="Signing in…" />;
  if (!user || blocked) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  if (!firebaseConfigured) return <SetupMissing />;
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><DataProvider><Layout /></DataProvider></Protected>}>
            <Route index element={<Overview />} />
            <Route path="emergencies" element={<Emergencies />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="history" element={<History />} />
            <Route path="riders" element={<Riders />} />
            <Route path="vests" element={<Vests />} />
            <Route path="settings" element={<Protected admin><Settings /></Protected>} />
            <Route path="audit" element={<Protected admin><AuditLog /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
