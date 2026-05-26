/**
 * Simple in-memory cache for conflict detection results.
 * Stores cached conflict data with TTL to prevent stale data.
 */

interface CachedConflicts {
  conflicts: any[];
  summary: Record<string, number>;
  total: number;
  unresolved: number;
  lastChecked: string;
  timestamp: number;
}

const conflictCacheStore = new Map<string, CachedConflicts>();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached conflicts for a user/role combination.
 * Returns null if cache is expired or doesn't exist.
 */
export function getCachedConflicts(cacheKey: string): CachedConflicts | null {
  const cached = conflictCacheStore.get(cacheKey);
  if (!cached) return null;

  // Check if cache is expired
  const age = Date.now() - cached.timestamp;
  if (age > DEFAULT_CACHE_TTL_MS) {
    conflictCacheStore.delete(cacheKey);
    return null;
  }

  return cached;
}

/**
 * Store conflicts in cache.
 */
export function setCachedConflicts(cacheKey: string, data: CachedConflicts): void {
  conflictCacheStore.set(cacheKey, {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Clear cache for a specific key or all keys.
 */
export function clearConflictCache(cacheKey?: string): void {
  if (cacheKey) {
    conflictCacheStore.delete(cacheKey);
  } else {
    conflictCacheStore.clear();
  }
}

/**
 * Generate a cache key based on user role/id and filters.
 */
export function generateConflictCacheKey(
  userId: string,
  role: string,
  departmentId?: string
): string {
  return `conflicts:${role}:${userId}:${departmentId || 'all'}`;
}
