/**
 * Daily Cleanup Service
 *
 * Automatically purges expired notification and audit log records from
 * Firestore based on configurable TTL (time-to-live) values.
 *
 * Architecture:
 *   - Primary: node-cron scheduler registered in instrumentation.ts
 *     (runs inside the Next.js server process at midnight)
 *   - Secondary: POST /api/cleanup for external cron services
 *     (Render Cron Jobs, cron-job.org, etc.)
 *   - Safety: batch deletes with limit to prevent runtime timeouts;
 *     idempotent — safe to call multiple times
 *
 * TTL defaults (overridable via environment variables):
 *   NOTIFICATIONS_TTL_DAYS  = 30  (notifications older than 30 days)
 *   AUDIT_LOGS_TTL_DAYS     = 60  (audit logs older than 60 days)
 */

import { db } from '@/lib/db';

// ── Configuration ──────────────────────────────────────────

const NOTIFICATIONS_TTL_DAYS = parseInt(process.env.NOTIFICATIONS_TTL_DAYS || '30', 10);
const AUDIT_LOGS_TTL_DAYS = parseInt(process.env.AUDIT_LOGS_TTL_DAYS || '60', 10);
const BATCH_LIMIT = 500; // Max documents to delete per batch

const CLEANUP_COLLECTIONS = [
  { name: 'notifications' as const, modelName: 'notification', ttlDays: NOTIFICATIONS_TTL_DAYS },
  { name: 'auditLogs' as const, modelName: 'auditLog', ttlDays: AUDIT_LOGS_TTL_DAYS },
] as const;

// ── Types ──────────────────────────────────────────────────

export interface CleanupResult {
  success: boolean;
  deleted: Record<string, number>;
  errors: string[];
  timestamp: string;
  ttlConfig: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Return a Date in the past used as the cutoff for deletion.
 * Documents with `createdAt` before this date are considered expired.
 */
function getCutoffDate(ttlDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ttlDays);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

/**
 * Format a Date to a Firestore-compatible ISO string that works
 * with the REST API's `<=` filter on `createdAt`.
 */
function formatDate(date: Date): string {
  return date.toISOString();
}

// ── Core Cleanup Logic ─────────────────────────────────────

/**
 * Execute a full cleanup of all ephemeral collections.
 * Only deletes records older than the configured TTL.
 * Uses batched deletion to avoid runtime timeouts.
 */
export async function executeCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    success: true,
    deleted: {},
    errors: [],
    timestamp: new Date().toISOString(),
    ttlConfig: {
      notifications: NOTIFICATIONS_TTL_DAYS,
      auditLogs: AUDIT_LOGS_TTL_DAYS,
    },
  };

  for (const { name, modelName, ttlDays } of CLEANUP_COLLECTIONS) {
    const cutoff = getCutoffDate(ttlDays);
    const cutoffStr = formatDate(cutoff);
    let totalDeleted = 0;

    try {
      const model = (db as any)[modelName];

      if (!model?.deleteMany) {
        result.errors.push(`Model "${modelName}" has no deleteMany method`);
        result.deleted[name] = 0;
        continue;
      }

      console.log(
        `[Cleanup] Purging "${name}" older than ${ttlDays}d (cutoff: ${cutoffStr})...`
      );

      // Batch-delete to avoid exhausting runtime resources
      let batchCount = 0;
      let hasMore = true;

      while (hasMore) {
        const whereFilter = {
          createdAt: { lte: cutoffStr },
        };

        const { count } = await model.deleteMany({
          where: whereFilter,
          limit: BATCH_LIMIT,
        });

        totalDeleted += count;
        batchCount++;

        if (count === 0 || count < BATCH_LIMIT) {
          hasMore = false;
        } else {
          console.log(
            `[Cleanup]  Batch ${batchCount}: deleted ${count} from "${name}" (running total: ${totalDeleted})`
          );
        }
      }

      result.deleted[name] = totalDeleted;
      console.log(`[Cleanup] ✅ Purged ${totalDeleted} expired records from "${name}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Cleanup] ❌ Error purging "${name}":`, message);
      result.errors.push(`Error purging "${name}": ${message}`);
      result.deleted[name] = totalDeleted; // Partial count if error mid-way
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  console.log(
    `[Cleanup] Finished — deleted: ${JSON.stringify(result.deleted)}` +
    (result.errors.length > 0 ? ` | errors: ${result.errors.join('; ')}` : '')
  );

  // Log the cleanup action itself to the audit trail
  try {
    await db.auditLog.create({
      data: {
        action: 'cleanup_scheduled',
        entity: 'system',
        details: JSON.stringify(result),
      },
    });
  } catch {
    // Silently ignore — audit log creation might fail if its own collection
    // is being cleaned, or during cold starts
  }

  return result;
}

// ── Utility ────────────────────────────────────────────────

/**
 * Get the next midnight Date (12:00 AM tomorrow).
 */
export function getNextMidnight(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Calculate ms until next midnight.
 */
export function msUntilMidnight(): number {
  return getNextMidnight().getTime() - Date.now();
}
