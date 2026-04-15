import { NextRequest, NextResponse } from "next/server";
import { optimizeAndScoreService } from "@/lib/services/optimization";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { createOptimizationJob, completeJob, failJob } from "@/lib/jobs";
import logger from "@/lib/logger";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
  validatePromptInput,
} from "@/lib/routeHelpers";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();

    // Check rate limit
    const rateLimit = await checkRateLimit(session.user.id, "optimize-full");
    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        "/api/optimize-full",
        session.user.id,
        requestId,
      );
    }

    const body = await request.json();
    const { raw_prompt } = body;

    // Validate input
    const validation = validatePromptInput(raw_prompt, 50000);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Create optimization job
    const jobId = await createOptimizationJob(session.user.id);

    try {
      const result = await optimizeAndScoreService(raw_prompt);

      // Mark job as completed
      await completeJob(jobId, result);

      // Save to database with actual raw and optimized scores (if DATABASE_URL is set)
      if (process.env.DATABASE_URL) {
        try {
          await prisma.optimizationRecord.create({
            data: {
              raw_prompt,
              raw_score: JSON.stringify(result.raw_score),
              raw_score_total: result.raw_score.total,
              optimized_prompt: result.optimized_prompt,
              optimized_score: result.optimized_score
                ? JSON.stringify(result.optimized_score)
                : null,
              optimized_score_total: result.optimized_score?.total ?? null,
              optimization_explanation: result.explanation,
              userId: session.user.id,
            },
          });
        } catch (dbError: any) {
          logger.warn({
            route: "/api/optimize-full",
            userId: session.user.id,
            request_id: requestId,
            error: "Database save failed",
            message: dbError.message,
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info({
        route: "/api/optimize-full",
        userId: session.user.id,
        request_id: requestId,
        duration_ms: duration,
        status: 200,
        raw_score: (result.raw_score as any).total,
        optimized_score: (result.optimized_score as any).total,
        score_delta: (result.score_delta as any).total_delta,
      });

      const response = NextResponse.json({ ...result, jobId });
      const headers = formatRateLimitHeaders(rateLimit);
      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      response.headers.set(
        "X-Deprecation-Warning",
        "This endpoint is deprecated. Migrate to API key authentication. Session-based endpoints will sunset in 6 months.",
      );
      return response;
    } catch (serviceError: any) {
      // Mark job as failed
      await failJob(jobId, serviceError.message);
      throw serviceError;
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      "/api/optimize-full",
      requestId,
      duration,
      undefined,
      "Failed to optimize prompt",
    );
  }
}
