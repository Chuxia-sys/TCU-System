// =============================================================
// Next.js Instrumentation — Runs at Server Startup
// =============================================================
// This file runs ONCE when the Next.js server starts, before any
// route handlers or API routes are invoked. It is the earliest
// possible point to enforce Firestore-only database policy and
// register scheduled background tasks.
//
// CRITICAL: This project uses Firebase Firestore as its ONLY
// database. Prisma Client is NEVER used at runtime. Even if the
// system sets DATABASE_URL to a SQLite path, we override it here.
// =============================================================

let cronRegistered = false;

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

  // ── Register Daily Cleanup Cron ──────────────────────────
  // Runs every day at 12:00 AM (midnight) to delete old audit log
  // and notification records. Uses node-cron for reliability across
  // server restarts and deployments.
  //
  // The guard flag prevents duplicate registration during hot reloads
  // (Next.js dev mode can call register() multiple times).
  if (typeof process !== 'undefined' && !cronRegistered && process.env.NEXT_RUNTIME !== 'edge') {
    try {
      // Dynamic import to avoid bundling node-cron in edge runtime
      const cron = await import('node-cron');
      const { executeCleanup, msUntilMidnight } = await import('@/lib/cleanup-service');

      // Schedule: every day at 12:00 AM
      // Cron expression: '0 0 * * *'  — minute 0, hour 0, every day
      cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] ⏰ Midnight cleanup triggered');
        try {
          const result = await executeCleanup();
          console.log(`[Cron] ✅ Cleanup complete: ${JSON.stringify(result.deleted)}`);
        } catch (err) {
          console.error('[Cron] ❌ Cleanup failed:', err instanceof Error ? err.message : err);
        }
      }, {
        name: 'daily-midnight-cleanup',
        scheduled: true,
        timezone: 'Asia/Manila',
      });

      cronRegistered = true;
      const msUntil = msUntilMidnight();
      console.log(
        `[INSTRUMENTATION] ✅ Daily cleanup cron registered (next run in ~${Math.round(msUntil / 60000)} min)`
      );
    } catch (err) {
      console.warn(
        '[INSTRUMENTATION] ⚠️ Could not register daily cleanup cron:',
        err instanceof Error ? err.message : err
      );
    }
  }
}
