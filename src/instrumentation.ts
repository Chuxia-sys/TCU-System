// =============================================================
// Next.js Instrumentation — Runs at Server Startup
// =============================================================
// This file runs ONCE when the Next.js server starts, before any
// route handlers or API routes are invoked. It is the earliest
// possible point to enforce Firestore-only database policy.
//
// CRITICAL: This project uses Firebase Firestore as its ONLY
// database. Prisma Client is NEVER used at runtime. Even if the
// system sets DATABASE_URL to a SQLite path, we override it here.
// =============================================================

export async function register() {
  // ── Neutralize DATABASE_URL ───────────────────────────────
  // The system environment may set DATABASE_URL to a SQLite path.
  // We override it to /dev/null to prevent any accidental SQLite usage.
  if (typeof process !== 'undefined' && process.env) {
    const currentUrl = process.env.DATABASE_URL || '';
    if (!currentUrl.includes('dev/null')) {
      console.warn(
        `[INSTRUMENTATION] ⚠️ DATABASE_URL was "${currentUrl}" — overriding to /dev/null. ` +
        `This project uses Firebase Firestore exclusively.`
      );
      process.env.DATABASE_URL = 'file:/dev/null';
    }
  }

  console.log(
    `[INSTRUMENTATION] 🛡️ Firestore-only guard active. ` +
    `DATABASE_URL=${process.env.DATABASE_URL || 'not set'}`
  );
}
