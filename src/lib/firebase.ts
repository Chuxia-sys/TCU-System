// Firebase Configuration for TCU Scheduling System
// Server-side operations use Firestore REST API (see db.ts)
// Client-side code can import firebaseConfig if needed

// ============================================================
// Firebase / Firestore Configuration
// All credentials are loaded from .env file
// The database is Firebase Firestore - NOT SQLite/Prisma
// ============================================================

// Firebase configuration (used by db.ts REST API adapter and client-side SDK)
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAuPYU1rM4QeH4p2BmfAD7o6ACnHNVeITk",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "for-commissions.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "for-commissions",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "for-commissions.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "68708704516",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:68708704516:web:81847843509cc6bfc6f051",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-PHYD2WFNE8"
};

// Server-side Firestore REST API configuration
export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'for-commissions';
export const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfig.apiKey;

// Firebase Admin SDK (server-side only)
// Uses service account credentials from:
//   FIREBASE_SERVICE_ACCOUNT_PATH — custom path to the JSON file
//   Default: looks for for-commissions-firebase-adminsdk-fbsvc-*.json in project root
//
// See src/lib/firebase-admin.ts for initialization and helpers.
