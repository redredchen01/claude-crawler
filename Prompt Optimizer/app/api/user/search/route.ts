import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();

    // Extract search parameters
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const limitStr = searchParams.get("limit") ?? "50";
    const offsetStr = searchParams.get("offset") ?? "0";

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query (q) is required and must be non-empty" },
        { status: 400 },
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: "Search query exceeds maximum length of 500 characters" },
        { status: 400 },
      );
    }

    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(offsetStr, 10) || 0, 0);

    // Search across all text fields
    const [results, totalCount] = await Promise.all([
      prisma.optimizationRecord.findMany({
        where: {
          userId: session.user.id,
          OR: [
            {
              raw_prompt: {
                contains: query,
              },
            },
            {
              optimized_prompt: {
                contains: query,
              },
            },
            {
              optimization_explanation: {
                contains: query,
              },
            },
          ],
        },
        select: {
          id: true,
          raw_prompt: true,
          raw_score_total: true,
          optimized_prompt: true,
          optimized_score_total: true,
          optimization_explanation: true,
          created_at: true,
        },
        orderBy: {
          created_at: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.optimizationRecord.count({
        where: {
          userId: session.user.id,
          OR: [
            {
              raw_prompt: {
                contains: query,
              },
            },
            {
              optimized_prompt: {
                contains: query,
              },
            },
            {
              optimization_explanation: {
                contains: query,
              },
            },
          ],
        },
      }),
    ]);

    const duration = Date.now() - startTime;

    logger.info({
      route: "/api/user/search",
      userId: session.user.id,
      request_id: requestId,
      duration_ms: duration,
      status: 200,
      query_length: query.length,
      results_count: results.length,
      total_count: totalCount,
    });

    return NextResponse.json({
      query,
      pagination: {
        limit,
        offset,
        total: totalCount,
        returned: results.length,
      },
      records: results.map((record) => ({
        id: record.id,
        raw_prompt: record.raw_prompt,
        raw_score: record.raw_score_total,
        optimized_prompt: record.optimized_prompt,
        optimized_score: record.optimized_score_total,
        explanation: record.optimization_explanation,
        created_at: record.created_at,
      })),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.name === "UnauthorizedError") {
      logger.warn({
        route: "/api/user/search",
        request_id: requestId,
        error: "Unauthorized",
        duration_ms: duration,
        status: 401,
      });
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error({
      route: "/api/user/search",
      request_id: requestId,
      error: error.message,
      duration_ms: duration,
      status: 500,
    });

    return NextResponse.json(
      { error: error.message || "Failed to search prompts" },
      { status: 500 },
    );
  }
}
