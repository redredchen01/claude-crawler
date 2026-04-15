/**
 * Cache Service
 *
 * Simple in-memory cache with TTL support for analytics queries
 */

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Cache Service
 */
export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000);
  }

  /**
   * Get cached value if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, value: T, ttlMinutes: number = 5): void {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    });
  }

  /**
   * Invalidate cache entries matching pattern
   * Pattern examples: "analytics:*", "project:123:*"
   */
  invalidate(pattern: string): number {
    const regex = new RegExp(
      `^${pattern.replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    );
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if ((entry as CacheEntry<unknown>).expiresAt < now) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      // Cleanup occurred, but we don't log to avoid spam
    }
  }

  /**
   * Shutdown cache (cleanup interval)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Global singleton instance
 */
export const cacheService = new CacheService();
