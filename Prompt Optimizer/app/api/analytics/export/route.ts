import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  getUsageAnalytics,
  validateDatePeriod,
  formatAsCSV,
  formatAsJSON,
} from "@/lib/analytics";
import { getTeamById } from "@/lib/teams";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const format = searchParams.get("format") || "json";
    const teamId = searchParams.get("teamId");

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate query parameters are required" },
        { status: 400 },
      );
    }

    // Validate format
    if (format !== "csv" && format !== "json") {
      return NextResponse.json(
        { error: "format must be 'csv' or 'json'" },
        { status: 400 },
      );
    }

    // Validate date range
    const dateError = validateDatePeriod(startDate, endDate);
    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 });
    }

    // If teamId provided, verify user is member
    if (teamId) {
      const team = await getTeamById(teamId, session.user.id);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found or access denied" },
          { status: 403 },
        );
      }
    }

    // Get analytics
    const analytics = await getUsageAnalytics(
      startDate,
      endDate,
      teamId || undefined,
      !teamId ? session.user.id : undefined,
    );

    // Format response
    let content: string;
    let contentType: string;
    let filename: string;

    if (format === "csv") {
      content = formatAsCSV(analytics);
      contentType = "text/csv";
      filename = `analytics_${analytics.period}.csv`;
    } else {
      content = formatAsJSON(analytics);
      contentType = "application/json";
      filename = `analytics_${analytics.period}.json`;
    }

    logger.info({
      route: "/api/analytics/export",
      userId: session.user.id,
      teamId,
      format,
      startDate,
      endDate,
      status: 200,
    });

    const response = new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

    return response;
  } catch (error: any) {
    logger.error({
      route: "/api/analytics/export",
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
