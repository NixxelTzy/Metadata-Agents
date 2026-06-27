/**
 * Multi-tier rate limiter using sliding window + token bucket algorithm.
 * Supports global, per-IP, per-user, and per-endpoint rate limiting.
 * Uses in-memory store with automatic cleanup.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

export interface RateLimitTier {
  windowMs: number;
  maxRequests: number;
  blockDurationMs: number;
}

interface WindowEntry {
  timestamps: number[];
  blockedUntil: number;
}

/** Preset rate limit tiers */
export const TIERS: Record<string, RateLimitTier> = {
  /** Auth endpoints: 5 requests per 15 minutes */
  AUTH: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    blockDurationMs: 15 * 60 * 1000,
  },
  /** General API: 60 requests per minute */
  API: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    blockDurationMs: 60 * 1000,
  },
  /** Upload endpoints: 10 requests per minute */
  UPLOAD: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    blockDurationMs: 5 * 60 * 1000,
  },
  /** Strict endpoints: 3 requests per hour */
  STRICT: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    blockDurationMs: 60 * 60 * 1000,
  },
};

/**
 * Multi-tier rate limiter with sliding window algorithm.
 * Automatically cleans up expired entries every 5 minutes.
 */
export class MultiTierRateLimiter {
  private store: Map<string, WindowEntry>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.store = new Map();
    // Auto cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Allow process to exit even if interval is active
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check whether a key is allowed under the given tier.
   * @param key - Unique identifier (IP, user ID, endpoint, etc.)
   * @param tier - The rate limit tier to apply
   * @returns RateLimitResult with allow status and metadata
   */
  check(key: string, tier: RateLimitTier): RateLimitResult {
    const now = Date.now();
    const windowStart = now - tier.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [], blockedUntil: 0 };
      this.store.set(key, entry);
    }

    // Check if currently blocked
    if (entry.blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }

    // Sliding window: remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const count = entry.timestamps.length;

    if (count >= tier.maxRequests) {
      // Block the key
      entry.blockedUntil = now + tier.blockDurationMs;
      const resetAt = entry.timestamps[0]! + tier.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(tier.blockDurationMs / 1000),
      };
    }

    // Allow the request
    entry.timestamps.push(now);
    const resetAt =
      entry.timestamps.length > 0
        ? entry.timestamps[0]! + tier.windowMs
        : now + tier.windowMs;

    return {
      allowed: true,
      remaining: tier.maxRequests - entry.timestamps.length,
      resetAt,
      retryAfter: 0,
    };
  }

  /**
   * Manually reset the rate limit state for a key.
   * @param key - The key to reset
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clean up expired entries from the in-memory store.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      // Remove if no recent timestamps and block has expired
      const hasActive = entry.timestamps.some((ts) => ts > now - 60 * 60 * 1000);
      const isBlocked = entry.blockedUntil > now;
      if (!hasActive && !isBlocked) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the cleanup interval (useful for tests). */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Singleton instance of MultiTierRateLimiter */
export const rateLimiter = new MultiTierRateLimiter();
