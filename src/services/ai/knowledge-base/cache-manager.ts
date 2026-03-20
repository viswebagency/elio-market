/**
 * AI cache manager — manages L1 cache for pre-computed AI responses.
 */

export interface CacheEntry {
  key: string;
  value: string;
  ttlSeconds: number;
  createdAt: number;
}

export class AICacheManager {
  private cache: Map<string, CacheEntry> = new Map();

  /** Get a cached value */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now() / 1000;
    if (now - entry.createdAt > entry.ttlSeconds) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /** Set a cached value */
  set(key: string, value: string, ttlSeconds = 3600): void {
    this.cache.set(key, {
      key,
      value,
      ttlSeconds,
      createdAt: Date.now() / 1000,
    });
  }

  /** Invalidate a specific key */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Clear all cache */
  clear(): void {
    this.cache.clear();
  }

  /** Get cache stats */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const aiCacheManager = new AICacheManager();
