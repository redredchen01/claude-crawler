import { prisma } from "@/lib/db";
import { shouldTriggerWebhook, queueRateLimitWarning } from "@/lib/webhooks";
import { metricsCollector } from "@/lib/metrics";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

// In-memory store for score endpoint (lightweight, TTL-based)
interface ScoreTracking {
  count: number;
  windowStart: number; // timestamp in ms
}

const scoreTracker = new Map<string, ScoreTracking>();

// Clean up expired entries (run periodically)
function cleanupExpiredScoreEntries() {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  for (const [userId, tracking] of scoreTracker.entries()) {
    if (now - tracking.windowStart > oneHourMs) {
      scoreTracker.delete(userId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredScoreEntries, 10 * 60 * 1000);

export async function checkRateLimit(
  userId: string,
  endpoint: "optimize-full" | "score",
): Promise<RateLimitResult> {
  if (endpoint === "optimize-full") {
    return checkOptimizeFullRateLimit(userId);
  } else {
    return checkScoreRateLimit(userId);
  }
}

async function checkOptimizeFullRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  const limit = parseInt(process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR || "10", 10);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Count recent records within 1-hour window
  const count = await prisma.optimizationRecord.count({
    where: {
      userId,
      created_at: {
        gt: oneHourAgo,
      },
    },
  });

  const allowed = count < limit;
  const remaining = Math.max(0, limit - count);

  // Calculate resetAt: oldest record's created_at + 1 hour
  // If no records, resetAt is now + 1 hour
  let resetAt: Date;
  if (count > 0) {
    const oldestRecord = await prisma.optimizationRecord.findFirst({
      where: {
        userId,
        created_at: {
          gt: oneHourAgo,
        },
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (oldestRecord) {
      resetAt = new Date(oldestRecord.created_at.getTime() + 60 * 60 * 1000);
    } else {
      resetAt = new Date(Date.now() + 60 * 60 * 1000);
    }
  } else {
    resetAt = new Date(Date.now() + 60 * 60 * 1000);
  }

  // Trigger webhook if remaining < 10% (async, don't await)
  if (shouldTriggerWebhook(limit, remaining)) {
    queueRateLimitWarning(
      userId,
      "optimize-full",
      limit,
      remaining,
      resetAt,
    ).catch(
      () => {}, // Silent fail for webhooks
    );
  }

  // Record metric if rate limit hit
  if (!allowed) {
    metricsCollector.recordRateLimitHit(userId, "optimize-full", resetAt);
  }

  return {
    allowed,
    remaining,
    limit,
    resetAt,
  };
}

function checkScoreRateLimit(userId: string): RateLimitResult {
  const limit = parseInt(process.env.RATE_LIMIT_SCORE_PER_HOUR || "30", 10);
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  const tracking = scoreTracker.get(userId);

  if (!tracking) {
    // First request in window - remaining = limit before increment
    scoreTracker.set(userId, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit,
      limit,
      resetAt: new Date(now + oneHourMs),
    };
  }

  const elapsed = now - tracking.windowStart;

  if (elapsed > oneHourMs) {
    // Window expired, reset
    scoreTracker.set(userId, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit,
      limit,
      resetAt: new Date(now + oneHourMs),
    };
  }

  // Within window - calculate remaining BEFORE incrementing
  const remaining = Math.max(0, limit - tracking.count);
  tracking.count++;

  const allowed = tracking.count <= limit;
  const resetAt = new Date(tracking.windowStart + oneHourMs);

  // Trigger webhook if remaining < 10% (async, don't await)
  if (shouldTriggerWebhook(limit, remaining)) {
    queueRateLimitWarning(userId, "score", limit, remaining, resetAt).catch(
      () => {}, // Silent fail for webhooks
    );
  }

  // Record metric if rate limit hit
  if (!allowed) {
    metricsCollector.recordRateLimitHit(userId, "score", resetAt);
  }

  return {
    allowed,
    remaining,
    limit,
    resetAt,
  };
}
