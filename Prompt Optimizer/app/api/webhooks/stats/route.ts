import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getTeamById } from "@/lib/teams";
import { getWebhookStats } from "@/lib/webhooks";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    // If teamId provided, verify user is team member
    if (teamId) {
      const team = await getTeamById(teamId, session.user.id);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found or access denied" },
          { status: 403 },
        );
      }
    }

    // Get webhook stats for user (team webhooks not yet separated)
    const stats = await getWebhookStats(session.user.id);

    logger.info(
      { userId: session.user.id, teamId, ...stats },
      "Webhook stats retrieved",
    );

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error({
      route: "/api/webhooks/stats",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to retrieve webhook statistics" },
      { status: 500 },
    );
  }
}
