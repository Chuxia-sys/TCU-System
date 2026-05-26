'use client';

/**
 * Persisted cache storage adapter for TanStack Query.
 * Stores query cache in localStorage so it survives page refreshes.
 * Used to hydrate queries on initial load for instant page revisits.
 */

const STORAGE_KEY = 'tcu-query-cache';
const MAX_CACHE_SIZE = 1024 * 500; // 500KB max localStorage usage

interface StoredEntry {
  data: unknown;
  timestamp: number;
  queryKey: string;
}

/**
 * Save query data to localStorage with size limits and expiry.
 */
export function persistQueryToLocal(key: string, data: unknown): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cache: Record<string, StoredEntry> = raw ? JSON.parse(raw) : {};

    // Don't store large payloads (over 50KB per entry)
    const serialized = JSON.stringify(data);
    if (serialized.length > 50 * 1024) return;

    cache[key] = {
      data,
      timestamp: Date.now(),
      queryKey: key,
    };

    // Evict oldest entries if over size limit
    let totalSize = new Blob([JSON.stringify(cache)]).size;
    if (totalSize > MAX_CACHE_SIZE) {
      const entries = Object.entries(cache).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      );
      while (totalSize > MAX_CACHE_SIZE && entries.length > 0) {
        const [oldKey] = entries.shift()!;
        const removedSize = new Blob([JSON.stringify(cache[oldKey])]).size;
        delete cache[oldKey];
        totalSize -= removedSize;
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage might be full or unavailable
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

/**
 * Retrieve persisted query data if not expired.
 */
export function getPersistedQuery<T = unknown>(
  key: string,
  maxAgeMs: number = 30 * 60 * 1000 // 30 minutes default
): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cache: Record<string, StoredEntry> = JSON.parse(raw);
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > maxAgeMs) {
      delete cache[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.data as T;
  } catch {
    return null;
  }
}

/**
 * Remove a specific entry from persisted cache.
 */
export function removePersistedQuery(key: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const cache: Record<string, StoredEntry> = JSON.parse(raw);
    delete cache[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

/**
 * Clear all persisted query data.
 */
export function clearPersistedCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
