import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getUsageAnalytics, validateDatePeriod } from "@/lib/analytics";
import { getTeamById } from "@/lib/teams";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const teamId = searchParams.get("teamId");

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate query parameters are required" },
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
      !teamId ? session.user.id : undefined, // Only filter by user if not team-scoped
    );

    logger.info({
      route: "/api/analytics/usage",
      userId: session.user.id,
      teamId,
      startDate,
      endDate,
      status: 200,
    });

    return NextResponse.json(analytics);
  } catch (error: any) {
    logger.error({
      route: "/api/analytics/usage",
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
