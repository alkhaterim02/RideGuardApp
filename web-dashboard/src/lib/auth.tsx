import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { UserDoc } from './types';

interface AuthState {
  loading: boolean;
  user: User | null;
  profile: UserDoc | null;
  /** Why a signed-in account cannot use the dashboard (rider, pending, missing profile), if any. */
  blocked: string | null;
  isAdmin: boolean;
}

const Ctx = createContext<AuthState>({ loading: true, user: null, profile: null, blocked: null, isAdmin: false });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, profile: null, blocked: null, isAdmin: false });

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      if (!user) { setState({ loading: false, user: null, profile: null, blocked: null, isAdmin: false }); return; }
      setState((s) => ({ ...s, loading: true }));
      unsubDoc = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        const profile = snap.exists() ? ({ id: snap.id, ...snap.data() } as UserDoc) : null;
        let blocked: string | null = null;
        if (!profile) blocked = 'This account has no RideGuard profile. Ask your company administrator to set it up.';
        else if (profile.role === 'rider') blocked = 'This is a rider account. Riders use the RideGuard Android app; the dashboard is for company staff.';
        else if (profile.status !== 'active') blocked = 'This staff account is not active. Contact your company administrator.';
        setState({ loading: false, user, profile, blocked, isAdmin: profile?.role === 'company_admin' && !blocked });
      }, () => setState({ loading: false, user, profile: null, blocked: 'Could not load your profile (permission denied).', isAdmin: false }));
    });
    return () => { unsubDoc?.(); unsubAuth(); };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const logout = () => signOut(auth);
