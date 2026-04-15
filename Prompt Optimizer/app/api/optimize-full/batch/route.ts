import { NextRequest, NextResponse } from "next/server";
import { optimizeAndScoreService } from "@/lib/services/optimization";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import logger from "@/lib/logger";

const BATCH_MAX_SIZE = 10;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const body = await request.json();
    const { prompts } = body;

    // Validate input
    if (!Array.isArray(prompts)) {
      return NextResponse.json(
        { error: "prompts must be an array" },
        { status: 400 },
      );
    }

    if (prompts.length === 0) {
      return NextResponse.json(
        { error: "prompts array cannot be empty" },
        { status: 400 },
      );
    }

    if (prompts.length > BATCH_MAX_SIZE) {
      return NextResponse.json(
        {
          error: `prompts array exceeds maximum size of ${BATCH_MAX_SIZE}`,
        },
        { status: 400 },
      );
    }

    // Validate each prompt
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        return NextResponse.json(
          { error: `prompts[${i}] must be a non-empty string` },
          { status: 400 },
        );
      }
      if (prompt.length > 50000) {
        return NextResponse.json(
          { error: `prompts[${i}] exceeds maximum length of 50000 characters` },
          { status: 400 },
        );
      }
    }

    // Check rate limit for all prompts
    const rateLimit = await checkRateLimit(session.user.id, "optimize-full");
    if (rateLimit.remaining < prompts.length) {
      logger.warn({
        route: "/api/optimize-full/batch",
        userId: session.user.id,
        request_id: requestId,
        status: 429,
        error: "Insufficient rate limit quota for batch size",
        needed: prompts.length,
        remaining: rateLimit.remaining,
      });

      return NextResponse.json(
        {
          error: `Insufficient rate limit quota. Needed: ${prompts.length}, Remaining: ${rateLimit.remaining}`,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(
              Math.ceil(rateLimit.resetAt.getTime() / 1000),
            ),
            "Retry-After": String(
              Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
            ),
          },
        },
      );
    }

    // Process all prompts in parallel
    const results = await Promise.all(
      prompts.map(async (prompt) => {
        try {
          const result = await optimizeAndScoreService(prompt);
          return {
            success: true,
            raw_prompt: prompt,
            optimized_prompt: result.optimized_prompt,
            explanation: result.explanation,
            raw_score: result.raw_score,
            optimized_score: result.optimized_score,
            score_delta: result.score_delta,
          };
        } catch (error: any) {
          return {
            success: false,
            raw_prompt: prompt,
            error: error.message || "Failed to optimize prompt",
          };
        }
      }),
    );

    // Save successful results to database
    if (process.env.DATABASE_URL) {
      const recordsToCreate = results
        .filter((r) => r.success)
        .map((r) => ({
          raw_prompt: r.raw_prompt,
          raw_score: JSON.stringify(r.raw_score),
          raw_score_total: (r.raw_score as any).total,
          optimized_prompt: r.optimized_prompt,
          optimized_score: JSON.stringify(r.optimized_score),
          optimized_score_total: (r.optimized_score as any).total,
          optimization_explanation: r.explanation,
          userId: session.user.id,
        }));

      try {
        if (recordsToCreate.length > 0) {
          await prisma.optimizationRecord.createMany({
            data: recordsToCreate,
          });
        }
      } catch (dbError: any) {
        logger.warn({
          route: "/api/optimize-full/batch",
          userId: session.user.id,
          request_id: requestId,
          error: "Database batch save failed",
          message: dbError.message,
          successCount: results.filter((r) => r.success).length,
        });
        // Continue - batch partially saved
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;

    logger.info({
      route: "/api/optimize-full/batch",
      userId: session.user.id,
      request_id: requestId,
      duration_ms: duration,
      status: 200,
      batch_size: prompts.length,
      success_count: successCount,
      failure_count: results.length - successCount,
    });

    const response = NextResponse.json({
      batch_size: prompts.length,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
      },
    });

    response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
    response.headers.set(
      "X-RateLimit-Remaining",
      String(rateLimit.remaining - prompts.length),
    );
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAt.getTime() / 1000)),
    );

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.name === "UnauthorizedError") {
      logger.warn({
        route: "/api/optimize-full/batch",
        request_id: requestId,
        error: "Unauthorized",
        duration_ms: duration,
        status: 401,
      });
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error({
      route: "/api/optimize-full/batch",
      request_id: requestId,
      error: error.message,
      duration_ms: duration,
      status: 500,
    });

    return NextResponse.json(
      { error: error.message || "Failed to process batch" },
      { status: 500 },
    );
  }
}
