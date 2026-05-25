import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { executeCleanup } from '@/lib/cleanup-service';

/**
 * POST /api/cleanup
 * 
 * Triggers a manual cleanup of audit log and notification records.
 * Requires admin authentication for security.
 * 
 * Designed to be called by:
 *   1. An external cron service (e.g., cron-job.org, Render Cron Jobs)
 *   2. The built-in node-cron scheduler in instrumentation.ts
 *   3. Manual admin trigger (future)
 * 
 * For external cron usage, provide an API key or admin session.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Authentication ──────────────────────────────────────
    // Require admin session or a valid API key for cron triggering
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.CLEANUP_API_KEY;
    
    let authorized = false;

    // Check for API key auth (for external cron services)
    if (apiKey && authHeader === `Bearer ${apiKey}`) {
      authorized = true;
    }

    // Fall back to session-based admin auth
    if (!authorized) {
      const session = await getAuthSession();
      if (session?.user?.role === 'admin') {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin session or valid API key required.' },
        { status: 401 }
      );
    }

    // ── Execute Cleanup ─────────────────────────────────────
    const result = await executeCleanup();

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Cleanup completed with errors',
          deleted: result.deleted,
          errors: result.errors,
          timestamp: result.timestamp,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cleanup complete. Deleted ${Object.values(result.deleted).reduce((a, b) => a + b, 0)} records.`,
      deleted: result.deleted,
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error('[Cleanup API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
