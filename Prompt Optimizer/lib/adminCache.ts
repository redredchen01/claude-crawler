/**
 * Admin Dashboard Cache Layer
 * Provides cache pre-warming for stats and timeline data
 * Reduces database load and improves API response time
 */

import { prisma } from "@/lib/db";
import * as adminDashboard from "@/lib/adminDashboard";
import logger from "@/lib/logger";

// In-memory cache with expiration
const cacheStore = new Map<
  string,
  { data: any; expiresAt: number; refreshing: boolean }
>();

// Cache configuration
const CACHE_CONFIG = {
  stats: {
    ttl: 30, // 30 seconds
    refreshBefore: 5, // Refresh 5 seconds before expiry
  },
  timeline: {
    ttl: 60, // 60 seconds
    refreshBefore: 5, // Refresh 5 seconds before expiry
  },
};

/**
 * Get cached stats or trigger background refresh
 */
export async function getCachedStats() {
  const key = "admin:stats";
  const cached = cacheStore.get(key);
  const now = Date.now();

  // Return valid cache
  if (cached && now < cached.expiresAt && !cached.refreshing) {
    return cached.data;
  }

  // If cache expired and not refreshing, trigger background refresh
  if (cached && now >= cached.expiresAt && !cached.refreshing) {
    triggerStatsRefresh().catch((err) =>
      logger.warn({ error: err.message }, "Failed to refresh stats cache"),
    );

    // Return stale cache as fallback (graceful degradation)
    if (cached.data) {
      return cached.data;
    }
  }

  // No cache, fetch fresh data
  try {
    const stats = await adminDashboard.getBatchStats();
    cacheStore.set(key, {
      data: stats,
      expiresAt: now + CACHE_CONFIG.stats.ttl * 1000,
      refreshing: false,
    });
    return stats;
  } catch (error) {
    logger.error({ error }, "Failed to get batch stats");
    throw error;
  }
}

/**
 * Get cached timeline or trigger background refresh
 */
export async function getCachedTimeline(hoursBack: number = 24) {
  const key = `admin:timeline:${hoursBack}h`;
  const cached = cacheStore.get(key);
  const now = Date.now();

  // Return valid cache
  if (cached && now < cached.expiresAt && !cached.refreshing) {
    return cached.data;
  }

  // If cache expired and not refreshing, trigger background refresh
  if (cached && now >= cached.expiresAt && !cached.refreshing) {
    triggerTimelineRefresh(hoursBack).catch((err) =>
      logger.warn(
        { error: err.message, hoursBack },
        "Failed to refresh timeline cache",
      ),
    );

    // Return stale cache as fallback
    if (cached.data) {
      return cached.data;
    }
  }

  // No cache, fetch fresh data
  try {
    const timeline = await adminDashboard.getBatchTimeline(hoursBack);
    cacheStore.set(key, {
      data: timeline,
      expiresAt: now + CACHE_CONFIG.timeline.ttl * 1000,
      refreshing: false,
    });
    return timeline;
  } catch (error) {
    logger.error({ error, hoursBack }, "Failed to get batch timeline");
    throw error;
  }
}

/**
 * Trigger background refresh of stats cache
 */
async function triggerStatsRefresh() {
  const key = "admin:stats";
  const cached = cacheStore.get(key);

  if (cached) {
    cached.refreshing = true;
  }

  try {
    const stats = await adminDashboard.getBatchStats();
    const now = Date.now();

    cacheStore.set(key, {
      data: stats,
      expiresAt: now + CACHE_CONFIG.stats.ttl * 1000,
      refreshing: false,
    });

    logger.info("Stats cache refreshed in background");
  } catch (error) {
    logger.error({ error }, "Background stats refresh failed");

    if (cached) {
      cached.refreshing = false;
    }
  }
}

/**
 * Trigger background refresh of timeline cache
 */
async function triggerTimelineRefresh(hoursBack: number) {
  const key = `admin:timeline:${hoursBack}h`;
  const cached = cacheStore.get(key);

  if (cached) {
    cached.refreshing = true;
  }

  try {
    const timeline = await adminDashboard.getBatchTimeline(hoursBack);
    const now = Date.now();

    cacheStore.set(key, {
      data: timeline,
      expiresAt: now + CACHE_CONFIG.timeline.ttl * 1000,
      refreshing: false,
    });

    logger.info({ hoursBack }, "Timeline cache refreshed in background");
  } catch (error) {
    logger.error({ error, hoursBack }, "Background timeline refresh failed");

    if (cached) {
      cached.refreshing = false;
    }
  }
}

/**
 * Invalidate stats cache (call when batch job completes/fails)
 */
export async function invalidateStatsCache() {
  cacheStore.delete("admin:stats");
  logger.debug("Stats cache invalidated");
}

/**
 * Invalidate all timeline caches
 */
export async function invalidateTimelineCache() {
  for (const key of cacheStore.keys()) {
    if (key.startsWith("admin:timeline:")) {
      cacheStore.delete(key);
    }
  }
  logger.debug("Timeline cache invalidated");
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  const now = Date.now();
  let activeKeys = 0;
  let staleCaches = 0;
  let refreshingCaches = 0;

  for (const [, value] of cacheStore) {
    if (now < value.expiresAt) {
      activeKeys++;
    } else {
      staleCaches++;
    }

    if (value.refreshing) {
      refreshingCaches++;
    }
  }

  return {
    totalCaches: cacheStore.size,
    activeKeys,
    staleCaches,
    refreshingCaches,
    hitRate: 0, // Can be enhanced with tracking
  };
}

/**
 * Clear all caches (for testing/admin)
 */
export function clearAllCaches() {
  cacheStore.clear();
  logger.info("All admin caches cleared");
}
