// =============================================================
// Prisma Client Hijack — Redirects @prisma/client to Firestore
// =============================================================
// ⚠️  CRITICAL: This module ensures that ANY code that imports
//     from '@prisma/client' or creates a PrismaClient instance
//     will be redirected to the Firebase Firestore adapter instead.
//
// This is a safety net to prevent accidental SQLite usage when
// the system DATABASE_URL environment variable points to a
// SQLite file.
//
// HOW IT WORKS:
// - Exports a `PrismaClient` class that wraps the Firestore adapter
// - Provides the same Prisma-compatible API (db.user, db.department, etc.)
// - Logs a warning when instantiated, so developers know Firestore is being used
// - The Firestore adapter (src/lib/db.ts) is the actual data access layer
// =============================================================

import { db } from './db';

/**
 * Firestore-backed PrismaClient replacement.
 * 
 * Instead of connecting to SQLite via Prisma, this class delegates
 * all database operations to the Firebase Firestore REST API adapter.
 * 
 * Usage: Same as PrismaClient — `const prisma = new PrismaClient()`
 * But all data flows through Firestore, not SQLite.
 */
export class PrismaClient {
  /** Reference to the Firestore adapter's db object */
  public readonly user = db.user;
  public readonly department = db.department;
  public readonly subject = db.subject;
  public readonly room = db.room;
  public readonly section = db.section;
  public readonly schedule = db.schedule;
  public readonly scheduleResponse = db.scheduleResponse;
  public readonly facultyPreference = db.facultyPreference;
  public readonly notification = db.notification;
  public readonly scheduleLog = db.scheduleLog;
  public readonly conflict = db.conflict;
  public readonly auditLog = db.auditLog;
  public readonly systemSetting = db.systemSetting;

  constructor() {
    console.warn(
      '[DB GUARD] ⚠️ PrismaClient was instantiated — redirecting to Firebase Firestore adapter. ' +
      'SQLite/Prisma is NOT used. All data flows through Firestore (project: for-commission).'
    );
  }

  /** No-op — Firestore doesn't need connection management */
  async $connect() {
    console.log('[DB GUARD] $connect() called — Firestore is always connected via REST API');
  }

  /** No-op — Firestore doesn't need disconnection */
  async $disconnect() {
    console.log('[DB GUARD] $disconnect() called — Firestore REST API has no persistent connection');
  }

  /** No-op — Firestore transactions are handled differently */
  async $transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/**
 * Re-export the Firestore db object as the default database client.
 * This ensures `import { db } from '@/lib/db'` always returns the Firestore adapter.
 */
export { db };
