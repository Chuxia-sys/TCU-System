// =============================================================
// Prisma-Firestore Bridge (Compatibility Stub)
// =============================================================
// ⚠️  CRITICAL: This module intercepts accidental imports of
//     @prisma/client and redirects them to the Firestore adapter.
//
// This project uses Firebase Firestore as its ONLY database.
// The `db` object from @/lib/db provides a Prisma-compatible API
// (findUnique, findMany, create, update, delete, etc.) but all
// operations go through the Firestore REST API.
//
// If any code accidentally imports from '@prisma/client', this
// module will be served instead (via webpack alias in next.config.ts).
// =============================================================

import { db } from './db';

// Re-export db as both the default export and as PrismaClient
// This makes the following patterns work:
//   import { PrismaClient } from '@prisma/client'  →  db
//   import prisma from '@prisma/client'             →  db
export const PrismaClient = db;
export default db;

// Named re-exports for common Prisma types (all no-ops / stubs)
// These prevent TypeScript errors if someone uses Prisma types
export const Prisma = {
  // Stub: if code references Prisma.ModelName, return empty object
  ModelName: {} as Record<string, string>,
  // Stub: if code references Prisma.TransactionIsolationLevel
  TransactionIsolationLevel: {} as Record<string, string>,
  // Stub: if code references Prisma.UserScalarFieldEnum etc.
  UserScalarFieldEnum: {} as Record<string, string>,
  // ScalarFieldEnum stubs for all models
  DepartmentScalarFieldEnum: {} as Record<string, string>,
  SubjectScalarFieldEnum: {} as Record<string, string>,
  RoomScalarFieldEnum: {} as Record<string, string>,
  SectionScalarFieldEnum: {} as Record<string, string>,
  ScheduleScalarFieldEnum: {} as Record<string, string>,
  ScheduleResponseScalarFieldEnum: {} as Record<string, string>,
  FacultyPreferenceScalarFieldEnum: {} as Record<string, string>,
  NotificationScalarFieldEnum: {} as Record<string, string>,
  ScheduleLogScalarFieldEnum: {} as Record<string, string>,
  ConflictScalarFieldEnum: {} as Record<string, string>,
  AuditLogScalarFieldEnum: {} as Record<string, string>,
  SystemSettingScalarFieldEnum: {} as Record<string, string>,
  // Sort order stubs
  SortOrder: { asc: 'asc', desc: 'desc' } as const,
  // Query mode stubs
  QueryMode: { default: 'default', insensitive: 'insensitive' } as const,
  // Nulls order stubs
  NullsOrder: { first: 'first', last: 'last' } as const,
};

// Log a warning so developers know the bridge is being used
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn(
    `[PRISMA BRIDGE] ⚠️ @prisma/client was imported but this project uses ` +
    `Firebase Firestore. The import has been redirected to the Firestore adapter. ` +
    `Use 'import { db } from @/lib/db' directly instead.`
  );
}
