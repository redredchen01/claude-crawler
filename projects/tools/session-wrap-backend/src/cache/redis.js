/**
 * Redis Cache Layer
 * Implements caching for performance optimization
 */

// Simple in-memory cache (fallback when Redis is not available)
class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.cache.delete(key);
      this.ttls.delete(key);
      return null;
    }

    return item;
  }

  async set(key, value, ttl = null) {
    this.cache.set(key, value);
    if (ttl) {
      this.ttls.set(key, Date.now() + ttl * 1000);
    }
  }

  async del(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }

  async clear() {
    this.cache.clear();
    this.ttls.clear();
  }
}

// Try to use Redis, fallback to simple in-memory cache
let cacheProvider = null;

const initCache = async () => {
  try {
    if (process.env.REDIS_URL) {
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL);

      // Test connection
      await redis.ping();
      cacheProvider = redis;
      console.log('✅ Redis cache initialized');
    } else {
      console.log('⚠️  Redis not configured, using in-memory cache');
      cacheProvider = new SimpleCache();
    }
  } catch (error) {
    console.warn('⚠️  Redis connection failed, using in-memory cache:', error.message);
    cacheProvider = new SimpleCache();
  }
};

// Cache configuration
const CACHE_TTL = {
  TASKS: 5 * 60,        // 5 minutes
  DECISIONS: 10 * 60,   // 10 minutes
  ANALYTICS: 60 * 60,   // 1 hour
  USER_PERMS: 2 * 60,   // 2 minutes
  WORKSPACE_MEMBERS: 5 * 60  // 5 minutes
};

// Generate cache key
const getCacheKey = (type, id, namespace = 'global') => {
  return `${namespace}:${type}:${id}`;
};

// Cache wrapper function
const cached = (type, ttl = null) => {
  return async (key, fetcher) => {
    if (!cacheProvider) {
      return fetcher();
    }

    try {
      const cached = await cacheProvider.get(key);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }

      const data = await fetcher();
      const actualTTL = ttl || CACHE_TTL[type] || 300;
      await cacheProvider.set(key, JSON.stringify(data), actualTTL);
      return data;
    } catch (error) {
      console.error('Cache error:', error);
      // Fall back to direct fetch on cache error
      return fetcher();
    }
  };
};

// Batch invalidate keys matching a pattern
const invalidatePattern = async (pattern) => {
  if (!cacheProvider) return;

  try {
    const keys = await cacheProvider.keys(pattern);
    if (keys.length > 0) {
      for (const key of keys) {
        await cacheProvider.del(key);
      }
    }
  } catch (error) {
    console.error('Error invalidating cache pattern:', error);
  }
};

// Clear all cache
const clearCache = async () => {
  if (!cacheProvider) return;

  try {
    await cacheProvider.clear();
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

module.exports = {
  initCache,
  cacheProvider: () => cacheProvider,
  CACHE_TTL,
  getCacheKey,
  cached,
  invalidatePattern,
  clearCache,
  SimpleCache
};
