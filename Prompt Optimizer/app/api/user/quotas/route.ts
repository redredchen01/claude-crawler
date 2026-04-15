import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { getResponseCache, setResponseCache } from "@/lib/redis";
import logger from "@/lib/logger";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
} from "@/lib/routeHelpers";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        "/api/user/quotas",
        session.user.id,
        requestId,
      );
    }

    // Try cache first
    const cacheKey = `quotas:${session.user.id}`;
    let quotas = await getResponseCache(session.user.id, "quotas");

    if (!quotas) {
      // Calculate fresh quotas
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const optimizeLimitEnv = parseInt(
        process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR || "10",
        10,
      );
      const scoreLimitEnv = parseInt(
        process.env.RATE_LIMIT_SCORE_PER_HOUR || "30",
        10,
      );

      // Get current usage
      const optimizeCount = await prisma.optimizationRecord.count({
        where: {
          userId: session.user.id,
          created_at: { gt: oneHourAgo },
        },
      });

      // Get 7-day usage for chart
      const dailyUsage = await prisma.optimizationRecord.groupBy({
        by: ["created_at"],
        where: {
          userId: session.user.id,
          created_at: { gte: sevenDaysAgo },
        },
        _count: true,
        orderBy: { created_at: "asc" },
      });

      // Get reset time
      const oldestRecord = await prisma.optimizationRecord.findFirst({
        where: {
          userId: session.user.id,
          created_at: { gt: oneHourAgo },
        },
        orderBy: { created_at: "asc" },
      });

      const resetAt = oldestRecord
        ? new Date(oldestRecord.created_at.getTime() + 60 * 60 * 1000)
        : new Date(now.getTime() + 60 * 60 * 1000);

      quotas = {
        optimize: {
          limit: optimizeLimitEnv,
          remaining: Math.max(0, optimizeLimitEnv - optimizeCount),
          resetAt: resetAt.toISOString(),
        },
        score: {
          limit: scoreLimitEnv,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        usage7d: dailyUsage.map((day) => ({
          date: day.created_at.toISOString().split("T")[0],
          count: day._count,
        })),
      };

      // Cache for 1 minute
      await setResponseCache(session.user.id, "quotas", quotas, 60);
    }

    const duration = Date.now() - startTime;
    logger.info({
      route: "/api/user/quotas",
      userId: session.user.id,
      duration_ms: duration,
      status: 200,
    });

    const response = NextResponse.json(quotas);
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      "/api/user/quotas",
      requestId,
      duration,
      undefined,
      "Failed to fetch quotas",
    );
  }
}
