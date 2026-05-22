type CacheKey = string;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessed: number;
  revalidating: boolean;
  revalidatePromise?: Promise<void>;
};

class FirestoreQueryCache {
  private cache = new Map<CacheKey, CacheEntry<any>>();
  private readonly maxEntries = 500;

  getOrFetch<T>(
    key: CacheKey,
    fetcher: () => Promise<T>,
    ttlMs: number = 30 * 1000
  ): Promise<T> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing) {
      existing.lastAccessed = now;

      if (existing.expiresAt > now) {
        return Promise.resolve(existing.value as T);
      }

      if (!existing.revalidating) {
        existing.revalidating = true;
        existing.revalidatePromise = this.refreshCacheEntry(key, fetcher, ttlMs, existing);
      }

      return Promise.resolve(existing.value as T);
    }

    return this.createCacheEntry(key, fetcher, ttlMs);
  }

  private async createCacheEntry<T>(
    key: CacheKey,
    fetcher: () => Promise<T>,
    ttlMs: number
  ): Promise<T> {
    const value = await fetcher();
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
      revalidating: false,
    };

    this.cache.set(key, entry);
    this.evictIfNeeded();
    return value;
  }

  private async refreshCacheEntry<T>(
    key: CacheKey,
    fetcher: () => Promise<T>,
    ttlMs: number,
    existing: CacheEntry<T>
  ): Promise<void> {
    try {
      const value = await fetcher();
      existing.value = value;
      existing.expiresAt = Date.now() + ttlMs;
    } catch (error) {
      console.warn('[QueryCache] stale refresh failed for key:', key, error instanceof Error ? error.message : error);
    } finally {
      existing.revalidating = false;
    }
  }

  invalidate(keyOrPattern: string | RegExp): void {
    if (typeof keyOrPattern === 'string') {
      this.cache.delete(keyOrPattern);
      return;
    }

    for (const key of Array.from(this.cache.keys())) {
      if (keyOrPattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  logStatus(): void {
    const keys = Array.from(this.cache.keys());
    console.log('[QueryCache] entries:', keys.length);
    for (const key of keys.slice(0, 20)) {
      const entry = this.cache.get(key);
      if (!entry) continue;
      console.log(`  ${key} -> expires in ${Math.max(0, entry.expiresAt - Date.now())}ms`);
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) {
      return;
    }

    const entries = Array.from(this.cache.entries());
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    while (this.cache.size > this.maxEntries && entries.length > 0) {
      const [key] = entries.shift() as [CacheKey, CacheEntry<any>];
      this.cache.delete(key);
    }
  }
}

export const queryCache = new FirestoreQueryCache();
