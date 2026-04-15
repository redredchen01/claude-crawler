import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const session = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit") || "50";
    const limit = Math.min(Math.max(parseInt(limitParam), 1), 500);

    // Fetch user's records, total count, and full-history aggregation in parallel
    const [records, totalCount, historyAgg] = await Promise.all([
      prisma.optimizationRecord.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
          created_at: true,
          raw_score: true,
          raw_score_total: true,
          optimized_score: true,
          optimized_score_total: true,
        },
        orderBy: {
          created_at: "desc",
        },
        take: limit,
      }),
      prisma.optimizationRecord.count({
        where: {
          userId: session.user.id,
        },
      }),
      prisma.optimizationRecord.aggregate({
        where: {
          userId: session.user.id,
        },
        _avg: {
          raw_score_total: true,
          optimized_score_total: true,
        },
      }),
    ]);

    // Parse scores with fallback to numeric totals
    const parsedRecords = records.map((r) => {
      let rawScore = r.raw_score_total ?? 0;
      let optimizedScore = r.optimized_score_total ?? 0;

      // Fallback to parsing JSON if numeric totals are null
      if (rawScore === 0 && r.raw_score) {
        try {
          rawScore = JSON.parse(r.raw_score).total ?? 0;
        } catch {
          rawScore = 0;
        }
      }
      if (optimizedScore === 0 && r.optimized_score) {
        try {
          optimizedScore = JSON.parse(r.optimized_score).total ?? 0;
        } catch {
          optimizedScore = 0;
        }
      }

      return {
        id: r.id,
        created_at: r.created_at.toISOString(),
        raw_score: rawScore,
        optimized_score: optimizedScore,
        delta: optimizedScore - rawScore,
      };
    });

    // Compute stats from full-history aggregation (not just current page)
    const avgRawScore =
      Math.round((historyAgg._avg.raw_score_total ?? 0) * 10) / 10;
    const avgOptimizedScore =
      Math.round((historyAgg._avg.optimized_score_total ?? 0) * 10) / 10;
    const avgDelta = Math.round((avgOptimizedScore - avgRawScore) * 10) / 10;

    logger.info(
      {
        route: "/api/user/history",
        duration_ms: Date.now() - start,
        status: 200,
        userId: session.user.id,
      },
      "route success",
    );

    return NextResponse.json(
      {
        records: parsedRecords,
        stats: {
          totalCount,
          avgRawScore,
          avgOptimizedScore,
          avgDelta,
        },
      },
      {
        headers: { "Cache-Control": "private, max-age=60" },
      },
    );
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error({ route: "/api/user/history", error: error.message });
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 },
    );
  }
}
