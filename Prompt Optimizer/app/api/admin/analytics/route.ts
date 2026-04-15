import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get("days") || "30";
    const days = Math.min(Math.max(parseInt(daysParam), 1), 365);

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch all records in the date range and user count in parallel
    const [records, userCount] = await Promise.all([
      prisma.optimizationRecord.findMany({
        where: {
          created_at: {
            gte: startDate,
            lte: now,
          },
          optimized_score: {
            not: null,
          },
        },
        select: {
          id: true,
          created_at: true,
          raw_score: true,
          raw_score_total: true,
          optimized_score: true,
          optimized_score_total: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ]);

    // Parse scores and compute aggregates
    interface ParsedScore {
      total: number;
      dimensions: {
        specificity: number;
        context: number;
        output_spec: number;
        runnability: number;
        evaluation: number;
        safety: number;
      };
    }

    const parsedRecords = records.map((r) => {
      let rawScore: ParsedScore = { total: 0, dimensions: {} as any };
      let optimizedScore: ParsedScore = { total: 0, dimensions: {} as any };

      try {
        if (r.raw_score) {
          rawScore = JSON.parse(r.raw_score);
        }
        if (r.optimized_score) {
          optimizedScore = JSON.parse(r.optimized_score);
        }
      } catch (e) {
        // Skip invalid JSON
      }

      return {
        date: r.created_at.toISOString().slice(0, 10),
        email: r.user?.email || "unknown",
        rawScore,
        optimizedScore,
      };
    });

    // Overview stats
    const avgRawScore =
      parsedRecords.length > 0
        ? Math.round(
            (parsedRecords.reduce((sum, r) => sum + r.rawScore.total, 0) /
              parsedRecords.length) *
              10,
          ) / 10
        : 0;

    const avgOptimizedScore =
      parsedRecords.length > 0
        ? Math.round(
            (parsedRecords.reduce((sum, r) => sum + r.optimizedScore.total, 0) /
              parsedRecords.length) *
              10,
          ) / 10
        : 0;

    const avgDelta = Math.round((avgOptimizedScore - avgRawScore) * 10) / 10;

    // Time series (by day) - pushed to SQL
    const timeSeriesRaw = await prisma.$queryRaw<
      Array<{ date: string; count: bigint }>
    >`
      SELECT
        substr(created_at, 1, 10) AS date,
        COUNT(*) as count
      FROM OptimizationRecord
      WHERE created_at >= ${startDate.toISOString()}
        AND created_at <= ${now.toISOString()}
        AND optimized_score IS NOT NULL
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
    `;

    const timeSeries = timeSeriesRaw.map((row) => ({
      date: row.date,
      count: Number(row.count),
    }));

    // Score distribution (buckets: 0-20, 21-40, 41-60, 61-80, 81-100) - pushed to SQL
    const distributionRaw = await prisma.$queryRaw<
      Array<{ bucket: string; count: bigint }>
    >`
      SELECT
        CASE
          WHEN raw_score_total BETWEEN 0 AND 20 THEN '0-20'
          WHEN raw_score_total BETWEEN 21 AND 40 THEN '21-40'
          WHEN raw_score_total BETWEEN 41 AND 60 THEN '41-60'
          WHEN raw_score_total BETWEEN 61 AND 80 THEN '61-80'
          ELSE '81-100'
        END AS bucket,
        COUNT(*) as count
      FROM OptimizationRecord
      WHERE created_at >= ${startDate.toISOString()}
        AND created_at <= ${now.toISOString()}
        AND optimized_score IS NOT NULL
        AND raw_score_total IS NOT NULL
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN '0-20' THEN 1
          WHEN '21-40' THEN 2
          WHEN '41-60' THEN 3
          WHEN '61-80' THEN 4
          ELSE 5
        END
    `;

    // Merge with default buckets to ensure all buckets always present
    const defaultBuckets = [
      { bucket: "0-20", count: 0 },
      { bucket: "21-40", count: 0 },
      { bucket: "41-60", count: 0 },
      { bucket: "61-80", count: 0 },
      { bucket: "81-100", count: 0 },
    ];

    const scoreDistribution = defaultBuckets.map((defaultBucket) => {
      const found = distributionRaw.find(
        (r) => r.bucket === defaultBucket.bucket,
      );
      return {
        bucket: defaultBucket.bucket,
        count: found ? Number(found.count) : 0,
      };
    });

    // Dimension averages
    const dimensionAverages = {
      specificity: 0,
      context: 0,
      output_spec: 0,
      runnability: 0,
      evaluation: 0,
      safety: 0,
    };

    if (parsedRecords.length > 0) {
      const dimensions = [
        "specificity",
        "context",
        "output_spec",
        "runnability",
        "evaluation",
        "safety",
      ] as const;

      dimensions.forEach((dim) => {
        const sum = parsedRecords.reduce((acc, r) => {
          return acc + (r.optimizedScore.dimensions[dim] || 0);
        }, 0);
        dimensionAverages[dim] =
          Math.round((sum / parsedRecords.length) * 10) / 10;
      });
    }

    // Top users by count - pushed to SQL
    const topUsersRaw = await prisma.$queryRaw<
      Array<{ email: string; count: bigint }>
    >`
      SELECT u.email, COUNT(*) as count
      FROM OptimizationRecord r
      JOIN User u ON r.userId = u.id
      WHERE r.created_at >= ${startDate.toISOString()}
        AND r.created_at <= ${now.toISOString()}
        AND r.optimized_score IS NOT NULL
      GROUP BY r.userId, u.email
      ORDER BY count DESC
      LIMIT 10
    `;

    const topUsers = topUsersRaw.map((row) => ({
      email: row.email,
      count: Number(row.count),
    }));

    logger.info(
      {
        route: "/api/admin/analytics",
        duration_ms: Date.now() - start,
        status: 200,
      },
      "route success",
    );

    return NextResponse.json(
      {
        overview: {
          totalUsers: userCount,
          totalOptimizations: records.length,
          avgRawScore,
          avgOptimizedScore,
          avgDelta,
        },
        timeSeries,
        scoreDistribution,
        dimensionAverages,
        topUsers,
      },
      {
        headers: { "Cache-Control": "private, max-age=300" },
      },
    );
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.message.includes("Admin") ? 403 : 401,
        },
      );
    }
    logger.error({ route: "/api/admin/analytics", error: error.message });
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
