'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── In-memory client cache ──
// Shared across all hook instances for the lifetime of the page.
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise?: Promise<T>; // in-flight dedup
}

const globalCache = new Map<string, CacheEntry<any>>();
const DEFAULT_STALE_MS = 60_000; // 60s before background refetch
const DEFAULT_TTL_MS = 300_000;  // 5min before hard expiry

// ── Dev logging ──
let queryLog: Array<{ key: string; source: 'cache' | 'fetch' | 'dedup'; timestamp: number }> = [];
const MAX_LOG = 200;

function logQuery(key: string, source: 'cache' | 'fetch' | 'dedup') {
  if (process.env.NODE_ENV === 'development') {
    queryLog.push({ key, source, timestamp: Date.now() });
    if (queryLog.length > MAX_LOG) queryLog.shift();
  }
}

export function getQueryLog() {
  return queryLog;
}

export function clearQueryLog() {
  queryLog = [];
}

export function printQueryReport() {
  if (queryLog.length === 0) return;
  const counts: Record<string, { fetch: number; cache: number; dedup: number }> = {};
  for (const entry of queryLog) {
    if (!counts[entry.key]) counts[entry.key] = { fetch: 0, cache: 0, dedup: 0 };
    counts[entry.key][entry.source]++;
  }

  console.group('%c📊 Query Report', 'font-size:14px;font-weight:bold');
  console.table(
    Object.entries(counts)
      .map(([key, c]) => ({ Key: key, Fetch: c.fetch, Cache: c.cache, Dedup: c.dedup, Total: c.fetch + c.cache + c.dedup }))
      .sort((a, b) => b.Total - a.Total)
  );
  console.groupEnd();
}

/**
 * A SWR (stale-while-revalidate) fetch hook with:
 * - Global deduplication of in-flight requests
 * - Client-side cache (stale data shown instantly, refetch in background)
 * - AbortController cleanup on unmount
 * - Dev logging to detect duplicate queries
 *
 * @param key Unique cache key (e.g. "subjects:all", "notifications:userId")
 * @param fetcher Function that returns a promise of the data. Receives an optional AbortSignal.
 * @param options.staleMs Time before background refresh (default 60s)
 * @param options.ttlMs Time before hard expiry (default 5min)
 * @param options.enabled Whether to fetch (default true)
 */
export function useCachedQuery<T = any>(
  key: string | null,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options?: {
    staleMs?: number;
    ttlMs?: number;
    enabled?: boolean;
  }
) {
  const { staleMs = DEFAULT_STALE_MS, ttlMs = DEFAULT_TTL_MS, enabled = true } = options || {};
  const [data, setData] = useState<T | null>(() => {
    if (!key) return null;
    const cached = globalCache.get(key);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      logQuery(key, 'cache');
      return cached.data;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(!data);
  const [error, setError] = useState<Error | null>(null);
  // Use undefined instead of null so destructuring defaults (e.g. `= []`) work
  const safeData = data ?? undefined;
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const keyRef = useRef(key);

  const execute = useCallback(async (k: string, force = false) => {
    if (abortRef.current && !abortRef.current.signal.aborted) {
      try { abortRef.current.abort(); } catch { /* AbortError guard */ }
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // Check cache (stale-while-revalidate)
    const cached = globalCache.get(k);
    if (!force && cached && Date.now() - cached.timestamp < staleMs) {
      // Data is fresh enough — skip fetch
      return;
    }

    // Check for in-flight dedup
    if (!force && cached?.promise) {
      logQuery(k, 'dedup');
      try {
        await cached.promise;
      } catch { /* already handled */ }
      const updated = globalCache.get(k);
      if (updated) {
        setData(updated.data);
        setIsLoading(false);
      }
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    const fetchPromise = fetcher(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || cancelledRef.current) return;
        const entry: CacheEntry<T> = { data: result, timestamp: Date.now() };
        globalCache.set(k, entry);
        logQuery(k, 'fetch');
        setData(result);
        setIsLoading(false);
        setError(null);
        return result;
      })
      .catch((err) => {
        if (controller.signal.aborted || cancelledRef.current) return;
        // On error, keep stale data if available
        if (!cached) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        setIsLoading(false);
        return null;
      });

    // Store promise for deduplication
    if (cached) {
      cached.promise = fetchPromise;
    } else {
      globalCache.set(k, { data: null as any, timestamp: 0, promise: fetchPromise });
    }

    await fetchPromise;
  }, [fetcher, staleMs]);

  // Main effect
  useEffect(() => {
    if (!key || !enabled) {
      setIsLoading(false);
      return;
    }
    keyRef.current = key;
    execute(key);
    return () => {
      cancelledRef.current = true;
      // Abort any in-flight request (errors are caught by the fetch .catch handler)
      if (abortRef.current && !abortRef.current.signal.aborted) {
        try { abortRef.current.abort(); } catch { /* AbortError guard - some polyfills throw */ }
      }
    };
  }, [key, enabled, execute]);

  // Force refresh
  const mutate = useCallback(async () => {
    if (keyRef.current) {
      await execute(keyRef.current, true);
    }
  }, [execute]);

  // Invalidate cache key
  const invalidate = useCallback(() => {
    if (keyRef.current) {
      globalCache.delete(keyRef.current);
    }
  }, []);

  return { data: safeData, isLoading, error, mutate, invalidate };
}

/**
 * Clear all cached entries.
 */
export function clearCache() {
  globalCache.clear();
}

/**
 * Invalidate specific cache keys matching a pattern.
 */
export function invalidateCache(pattern: string | RegExp) {
  if (typeof pattern === 'string') {
    globalCache.delete(pattern);
    return;
  }
  for (const key of Array.from(globalCache.keys())) {
    if (pattern.test(key)) {
      globalCache.delete(key);
    }
  }
}

/**
 * Prefetch data and store in cache without rendering anything.
 * Useful for anticipatory fetching.
 */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = globalCache.get(key);
  if (existing && Date.now() - existing.timestamp < DEFAULT_STALE_MS) {
    return Promise.resolve(existing.data);
  }
  if (existing?.promise) {
    return existing.promise;
  }
  const promise = fetcher().then((data) => {
    globalCache.set(key, { data, timestamp: Date.now() });
    return data;
  });
  // Store in-flight promise for dedup
  globalCache.set(key, { data: null as any, timestamp: 0, promise });
  return promise;
}
