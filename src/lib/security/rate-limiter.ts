/**
 * Rate limiter — token bucket implementation for API endpoints.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRatePerSecond;
  }

  /** Check if a request is allowed */
  check(key: string): { allowed: boolean; remainingTokens: number; retryAfterMs?: number } {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: now };
      this.store.set(key, entry);
    }

    // Refill tokens
    const elapsed = (now - entry.lastRefill) / 1000;
    entry.tokens = Math.min(this.maxTokens, entry.tokens + elapsed * this.refillRate);
    entry.lastRefill = now;

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return { allowed: true, remainingTokens: Math.floor(entry.tokens) };
    }

    const retryAfterMs = Math.ceil((1 - entry.tokens) / this.refillRate * 1000);
    return { allowed: false, remainingTokens: 0, retryAfterMs };
  }

  /** Clear expired entries */
  cleanup(maxAgeMs = 3600000): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (now - entry.lastRefill > maxAgeMs) {
        this.store.delete(key);
      }
    }
  }
}

/** Default rate limiters */
export const apiRateLimiter = new RateLimiter(60, 1);     // 60 requests, 1/sec refill
export const authRateLimiter = new RateLimiter(5, 0.1);    // 5 attempts, 1 per 10sec
export const aiRateLimiter = new RateLimiter(10, 0.167);    // 10 requests, 1 per 6sec
