import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import {
  getBatchAnalytics,
  getPerformanceMetrics,
  getCostAnalysis,
  getAnalyticsByDateRange,
  exportAnalyticsAsCSV,
} from "@/lib/advancedAnalytics";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || undefined;
    const format = searchParams.get("format") || "json"; // json, csv

    // Verify team access if teamId provided
    if (teamId) {
      const member = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: session.user.id,
          },
        },
      });

      if (!member) {
        return NextResponse.json(
          { error: "Team access denied" },
          { status: 403 },
        );
      }
    }

    if (format === "csv") {
      const csv = await exportAnalyticsAsCSV(session.user.id, teamId);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="batch-analytics.csv"',
        },
      });
    }

    // JSON format
    const [analytics, metrics, cost] = await Promise.all([
      getBatchAnalytics(session.user.id, teamId),
      getPerformanceMetrics(session.user.id, teamId),
      getCostAnalysis(session.user.id, teamId),
    ]);

    logger.info(
      {
        userId: session.user.id,
        teamId,
      },
      "Batch analytics retrieved",
    );

    return NextResponse.json({
      analytics,
      performance: metrics,
      cost,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/analytics/batch",
        error: error.message,
      },
      "Failed to retrieve batch analytics",
    );

    return NextResponse.json(
      { error: "Failed to retrieve analytics" },
      { status: 500 },
    );
  }
}
