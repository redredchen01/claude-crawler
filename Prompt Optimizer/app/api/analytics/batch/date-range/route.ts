import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getAnalyticsByDateRange } from "@/lib/advancedAnalytics";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || undefined;
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: "startDate and endDate parameters required" },
        { status: 400 },
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate must be before endDate" },
        { status: 400 },
      );
    }

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

    const analytics = await getAnalyticsByDateRange(
      session.user.id,
      startDate,
      endDate,
      teamId,
    );

    logger.info(
      {
        userId: session.user.id,
        teamId,
        startDate: startDateStr,
        endDate: endDateStr,
        dataPoints: analytics.length,
      },
      "Date range analytics retrieved",
    );

    return NextResponse.json({
      analytics,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/analytics/batch/date-range",
        error: error.message,
      },
      "Failed to retrieve date range analytics",
    );

    return NextResponse.json(
      { error: "Failed to retrieve analytics" },
      { status: 500 },
    );
  }
}
