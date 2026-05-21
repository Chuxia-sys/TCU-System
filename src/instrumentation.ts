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
  // ── Layer 1: Neutralize DATABASE_URL ───────────────────────
  // The system environment may set DATABASE_URL to a SQLite path.
  // We override it to /dev/null to prevent any accidental SQLite usage.
  if (typeof process !== 'undefined' && process.env) {
    const currentUrl = process.env.DATABASE_URL || '';
    if (currentUrl && !currentUrl.includes('dev/null')) {
      console.warn(
        `[INSTRUMENTATION] ⚠️ DATABASE_URL was "${currentUrl}" — overriding to /dev/null. ` +
        `This project uses Firebase Firestore exclusively.`
      );
      process.env.DATABASE_URL = 'file:/dev/null';
    }

    // Also set a flag so other modules know the guard has run
    process.env.__FIRESTORE_GUARD_ACTIVE = 'true';
  }

  // ── Layer 2: Validate Firestore Connection ─────────────────
  // Only run in Node.js server context (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { validateFirestoreConnection } = await import('./lib/db');
      const result = await validateFirestoreConnection();

      if (result.connected) {
        console.log(
          `[INSTRUMENTATION] ✅ Firebase Firestore connected (project: ${result.project})`
        );
      } else {
        console.error(
          `[INSTRUMENTATION] ❌ Firebase Firestore connection FAILED: ${result.error}`
        );
      }
    } catch (error) {
      console.error(
        `[INSTRUMENTATION] ❌ Failed to validate Firestore connection:`,
        error
      );
    }
  }

  console.log(
    `[INSTRUMENTATION] 🛡️ Firestore-only guard active. ` +
    `DATABASE_URL=${process.env.DATABASE_URL}`
  );
}
