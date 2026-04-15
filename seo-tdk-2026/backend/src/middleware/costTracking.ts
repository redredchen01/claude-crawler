/**
 * Cost Tracking Middleware
 *
 * Simple in-memory cost tracking for API calls
 * MVP: Record token usage, basic rate limiting per user per hour
 */

import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

interface CostRecord {
  userId: string;
  endpoint: string;
  tokensUsed: number;
  timestamp: Date;
}

interface RateLimitWindow {
  userId: string;
  requestCount: number;
  resetTime: number;
}

/**
 * In-memory cost tracking and rate limiting
 */
export class CostTrackingService {
  private static readonly costRecords: CostRecord[] = [];
  private static readonly rateLimitWindows = new Map<string, RateLimitWindow>();
  private static readonly REQUESTS_PER_HOUR = 100; // MVP: generous limit
  private static readonly WINDOW_SIZE_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Record an API call cost
   */
  static recordCost(
    userId: string,
    endpoint: string,
    tokensUsed: number,
  ): void {
    this.costRecords.push({
      userId,
      endpoint,
      tokensUsed,
      timestamp: new Date(),
    });

    // Keep only last 1000 records to avoid memory bloat
    if (this.costRecords.length > 1000) {
      this.costRecords.shift();
    }
  }

  /**
   * Check if user has exceeded rate limit
   */
  static checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const window = this.rateLimitWindows.get(userId);

    if (!window || now > window.resetTime) {
      // Create new window
      this.rateLimitWindows.set(userId, {
        userId,
        requestCount: 1,
        resetTime: now + this.WINDOW_SIZE_MS,
      });
      return true;
    }

    if (window.requestCount >= this.REQUESTS_PER_HOUR) {
      return false; // Rate limit exceeded
    }

    window.requestCount++;
    return true;
  }

  /**
   * Get cost summary for user
   */
  static getCostSummary(userId: string): {
    totalTokens: number;
    requestCount: number;
    avgTokensPerRequest: number;
  } {
    const userRecords = this.costRecords.filter((r) => r.userId === userId);
    const totalTokens = userRecords.reduce((sum, r) => sum + r.tokensUsed, 0);

    return {
      totalTokens,
      requestCount: userRecords.length,
      avgTokensPerRequest:
        userRecords.length > 0 ? totalTokens / userRecords.length : 0,
    };
  }

  /**
   * Get remaining requests in current window
   */
  static getRemainingRequests(userId: string): number {
    const window = this.rateLimitWindows.get(userId);
    if (!window || Date.now() > window.resetTime) {
      return this.REQUESTS_PER_HOUR;
    }
    return Math.max(0, this.REQUESTS_PER_HOUR - window.requestCount);
  }
}

/**
 * Middleware: Apply rate limiting to TDK endpoints
 */
export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const userId = c.get("userId");

  if (userId) {
    if (!CostTrackingService.checkRateLimit(userId)) {
      const remaining = CostTrackingService.getRemainingRequests(userId);
      throw new HTTPException(429, {
        message: `Rate limit exceeded. ${remaining} requests remaining.`,
      });
    }

    // Store remaining requests in context for response headers
    const remaining = CostTrackingService.getRemainingRequests(userId);
    c.set("x-remaining-requests", remaining);
  }

  await next();
};

/**
 * Middleware: Record cost after successful API call
 */
export const recordCostMiddleware = async (c: Context, next: Next) => {
  await next();

  // Only record on successful TDK generation
  if (c.req.path.includes("/tdk-optimize") && c.res.status === 200) {
    const userId = c.get("userId");
    if (userId) {
      try {
        const body = (await c.res.clone().json()) as any;
        const tokensUsed = body.data?.metadata?.tokensUsed || 0;
        CostTrackingService.recordCost(userId, c.req.path, tokensUsed);
      } catch {
        // Silently ignore if we can't parse response
      }
    }
  }
};
