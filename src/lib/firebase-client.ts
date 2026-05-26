'use client';

/**
 * Client-side Firebase initialization with offline persistence.
 *
 * This initializes Firebase on the client side with:
 * - Firestore persistent local cache (offline support)
 * - Multi-tab synchronization
 * - Automatic cache persistence across page refreshes
 *
 * IMPORTANT: The main data fetching in this app uses REST API calls
 * through Next.js API routes. This client-side Firebase setup enables:
 * 1. Future direct Firestore operations on the client
 * 2. Offline persistence for any client-side Firestore reads
 * 3. Firebase Auth state management on the client
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase';

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

/**
 * Initialize Firebase client app with Firestore offline persistence.
 * Safe to call multiple times — returns existing instance if already initialized.
 */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  app = initializeApp(firebaseConfig);
  console.log('[Firebase Client] ✅ App initialized');
  return app;
}

/**
 * Get a Firestore instance with persistent local cache enabled.
 * Data is persisted across page refreshes and supports offline reads.
 */
export function getFirestoreDB(): Firestore {
  if (db) return db;

  const firebaseApp = getFirebaseApp();

  // Initialize Firestore with persistent local cache
  // This enables:
  // - Offline reads (cached data shown when offline)
  // - Multi-tab synchronization (changes sync across tabs)
  // - Persistent cache across page refreshes
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  console.log('[Firestore Client] ✅ Initialized with persistent local cache');
  return db;
}

/**
 * Check if Firestore persistence is enabled and working.
 */
export function isFirestorePersistenceEnabled(): boolean {
  try {
    const db = getFirestoreDB();
    return !!db;
  } catch {
    return false;
  }
}
