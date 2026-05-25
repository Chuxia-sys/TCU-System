/**
 * Daily Cleanup Service
 * 
 * Automatically deletes all audit log and notification records from
 * Firestore every day at 12:00 AM (midnight). This prevents unbounded
 * growth of ephemeral collections.
 * 
 * Scheduling:
 *   - Uses node-cron for auto-execution within the Next.js server process
 *   - Also exposes a cleanup API route for external cron triggering
 *   - Designed to survive deployments (instrumentation.ts re-registers cron)
 */

import { db } from '@/lib/db';

// ── Configuration ──────────────────────────────────────────

const CLEANUP_COLLECTIONS = ['auditLogs', 'notifications'] as const;

// ── Core Cleanup Logic ─────────────────────────────────────

export interface CleanupResult {
  success: boolean;
  deleted: Record<string, number>;
  errors: string[];
  timestamp: string;
}

/**
 * Execute a full cleanup of all ephemeral collections.
 * Deletes ALL documents in auditLogs and notifications collections.
 * Safe to call multiple times — subsequent runs simply delete 0 records.
 */
export async function executeCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    success: true,
    deleted: {},
    errors: [],
    timestamp: new Date().toISOString(),
  };

  for (const collection of CLEANUP_COLLECTIONS) {
    try {
      // Build the model name from collection name
      // auditLogs → db.auditLog, notifications → db.notification
      const modelName = collection === 'auditLogs' ? 'auditLog' : 'notification';
      const model = (db as any)[modelName];

      if (!model?.deleteMany) {
        result.errors.push(`Model "${modelName}" has no deleteMany method`);
        result.deleted[collection] = 0;
        continue;
      }

      console.log(`[Cleanup] Deleting all records from "${collection}"...`);
      const { count } = await model.deleteMany({});
      result.deleted[collection] = count;
      console.log(`[Cleanup] Deleted ${count} records from "${collection}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Cleanup] Error deleting from "${collection}":`, message);
      result.errors.push(`Error deleting from "${collection}": ${message}`);
      result.deleted[collection] = 0;
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  console.log(`[Cleanup] Finished — deleted: ${JSON.stringify(result.deleted)}`);

  // Log the cleanup action itself
  try {
    await db.auditLog.create({
      data: {
        action: 'cleanup_scheduled',
        entity: 'system',
        details: JSON.stringify(result),
      },
    });
  } catch {
    // Silently ignore — audit log might have already been cleaned
  }

  return result;
}

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
