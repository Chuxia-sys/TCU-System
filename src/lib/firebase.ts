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
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBjw0HlEGRRLJ3EoFzhIkve-pFm__-qNM0Q",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "for-commission.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "for-commission",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "for-commission.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "985895868624",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:985895868624:web:3a41e2a7f875736258a6d5",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-YP7XL79XZS"
};

// Server-side Firestore REST API configuration
export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'for-commission';
export const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfig.apiKey;
export const FIREBASE_SERVICE_EMAIL = process.env.FIREBASE_SERVICE_EMAIL || 'tcu-admin@for-commission.firebaseapp.com';
export const FIREBASE_SERVICE_PASSWORD = process.env.FIREBASE_SERVICE_PASSWORD || 'tcu-admin-2024';
