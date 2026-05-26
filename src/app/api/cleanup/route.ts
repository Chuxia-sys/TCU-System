import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { executeCleanup } from '@/lib/cleanup-service';

/**
 * POST /api/cleanup
 *
 * Triggers a manual TTL-based cleanup of expired notification and
 * audit log records. Supports both admin session auth and API key
 * auth (for external cron services).
 *
 * Authentication (one of):
 *   1. `Authorization: Bearer <CLEANUP_API_KEY>` header
 *   2. Active admin user session (NextAuth)
 *
 * External cron providers (Render Cron Jobs, cron-job.org, etc.)
 * should use the API key method. Set CLEANUP_API_KEY in
 * environment variables and pass it as a Bearer token.
 *
 * The cleanup is idempotent — calling it multiple times is safe.
 * Only records older than the configured TTL are deleted.
 *
 * Response:
 *   200 — Cleanup completed successfully (may have partial errors)
 *   401 — Unauthorized (missing/invalid auth)
 *   500 — Internal error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Authentication ──────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.CLEANUP_API_KEY;

    let authorized = false;

    // API key auth (for external cron services)
    if (apiKey && authHeader === `Bearer ${apiKey}`) {
      authorized = true;
    }

    // Session-based admin auth (for manual triggers)
    if (!authorized) {
      try {
        const session = await getAuthSession();
        if (session?.user?.role === 'admin') {
          authorized = true;
        }
      } catch {
        // Session check failed — not critical for cron-triggered calls
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide admin session or valid CLEANUP_API_KEY.' },
        { status: 401 }
      );
    }

    // ── Execute Cleanup ─────────────────────────────────────
    console.log('[Cleanup API] ⏳ Starting TTL-based cleanup...');
    const result = await executeCleanup();
    const elapsed = Date.now() - startTime;

    const totalDeleted = Object.values(result.deleted).reduce((a, b) => a + b, 0);
    const status = result.success ? 200 : 500;

    console.log(
      `[Cleanup API] ${result.success ? '✅' : '⚠️'} Done in ${elapsed}ms. ` +
      `Deleted ${totalDeleted} records.` +
      (result.errors.length > 0 ? ` Errors: ${result.errors.join('; ')}` : '')
    );

    return NextResponse.json(
      {
        success: result.success,
        message: totalDeleted > 0
          ? `Purged ${totalDeleted} expired records across ${Object.keys(result.deleted).length} collections.`
          : 'No expired records found. TTL-based cleanup is up to date.',
        deleted: result.deleted,
        ttlConfig: result.ttlConfig,
        elapsedMs: elapsed,
        timestamp: result.timestamp,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { status }
    );
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error('[Cleanup API] ❌ Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        elapsedMs: elapsed,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cleanup
 *
 * Lightweight health-check endpoint for external cron services.
 * Returns the current TTL configuration without triggering a cleanup.
 * Does NOT require authentication.
 */
export async function GET() {
  return NextResponse.json({
        status: 'ok',
        service: 'ttl-cleanup',
        ttlConfig: {
          notifications: `${parseInt(process.env.NOTIFICATIONS_TTL_DAYS || '30', 10)} days`,
          auditLogs: `${parseInt(process.env.AUDIT_LOGS_TTL_DAYS || '60', 10)} days`,
        },
        nextScheduledRun: 'midnight (Asia/Manilla)',
        timestamp: new Date().toISOString(),
      });
}
