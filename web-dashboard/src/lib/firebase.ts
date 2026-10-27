import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const env = import.meta.env;
export const useEmulators = env.VITE_USE_EMULATORS === '1';

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-key' : ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? 'demo-rideguard' : ''),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (useEmulators ? 'demo-rideguard.appspot.com' : ''),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** False until web-dashboard/.env.local has the Firebase web config (or emulators are on). */
export const firebaseConfigured = !!(config.apiKey && config.projectId);

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let storage: FirebaseStorage;

if (firebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
}

/** A second app instance used only to create accounts, so the signed-in staff member is not switched. */
export function secondaryApp(): { app: FirebaseApp; auth: Auth } {
  const a = initializeApp(config, `secondary-${Date.now()}`);
  const au = getAuth(a);
  if (useEmulators) connectAuthEmulator(au, 'http://127.0.0.1:9099', { disableWarnings: true });
  return { app: a, auth: au };
}
