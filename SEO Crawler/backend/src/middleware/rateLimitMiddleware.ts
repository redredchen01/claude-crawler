import { Context, Next } from "hono";
import { redisService } from "../services/redisService";
import { loggerService } from "../services/loggerService";
import { metricsService } from "../services/metricsService";
import { getUserId } from "../auth/middleware";

export interface RateLimitConfig {
  limit: number; // Max requests
  window: number; // Time window in seconds
  keyPrefix?: string; // Custom key prefix (default: auto from endpoint)
}

/**
 * Rate Limiting Middleware - Redis-backed sliding window counter
 * Returns 429 Too Many Requests if limit exceeded
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const { limit, window } = config;

    // Determine rate limit key based on endpoint and user/IP
    const endpoint = c.req.path;
    const userId = getUserId(c);
    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for") ||
      "unknown";

    // Use userId if available (authenticated), otherwise use IP
    const identifier = userId ? `user:${userId}` : `ip:${clientIp}`;
    const rateLimitKey = `ratelimit:${identifier}:${endpoint}`;

    // Get current bucket timestamp
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `${rateLimitKey}:${now}`;

    try {
      // Increment counter atomically with expiry
      const count = await redisService.incrementWithExpiry(
        bucketKey,
        window + 1,
        1,
      );

      // Check if limit exceeded
      const isLimited = count > limit;

      // Calculate reset time
      const ttl = await redisService.ttl(bucketKey);
      const resetTime =
        (ttl ?? window) > 0 ? now + (ttl ?? window) : now + window;

      // Set rate limit headers
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
      c.header("X-RateLimit-Reset", String(resetTime));

      if (isLimited) {
        metricsService.recordError("RateLimitExceeded", endpoint);
        loggerService
          .getLogger()
          .warn(`Rate limit exceeded: ${identifier} on ${endpoint}`, {
            type: "rate_limit",
            endpoint,
            identifier,
            count,
            limit,
          });

        return c.json(
          {
            error: "Too Many Requests",
            message: `Rate limit of ${limit} requests per ${window} seconds exceeded`,
            retryAfter: window,
          },
          429,
        );
      }

      // Proceed to next handler
      await next();
    } catch (error) {
      // If Redis fails, log but allow request through (graceful degradation)
      loggerService.logError(
        error as Error,
        "Rate limit check failed",
        userId ?? undefined,
      );

      // Set default headers
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", String(limit - 1));
      c.header(
        "X-RateLimit-Reset",
        String(Math.floor(Date.now() / 1000) + window),
      );

      // Proceed to next handler
      await next();
    }
  };
}

/**
 * Strict rate limit for login attempts (per IP)
 */
export const loginRateLimit = rateLimitMiddleware({
  limit: 5,
  window: 300, // 5 minutes
});

/**
 * Moderate rate limit for analysis endpoints (per user)
 */
export const analysisRateLimit = rateLimitMiddleware({
  limit: 10,
  window: 60, // 1 minute
});

/**
 * Strict rate limit for batch operations (per user)
 */
export const batchRateLimit = rateLimitMiddleware({
  limit: 3,
  window: 60, // 1 minute
});
