import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getUserAuditLogs, getTeamAuditLogs } from "@/lib/audit";
import { getTeamById } from "@/lib/teams";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let logs;

    if (teamId) {
      // Get team audit logs - verify user is team member
      const team = await getTeamById(teamId, session.user.id);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found or access denied" },
          { status: 403 },
        );
      }

      logs = await getTeamAuditLogs(teamId, limit, offset);
    } else {
      // Get user's own audit logs
      logs = await getUserAuditLogs(session.user.id, limit, offset);
    }

    logger.info({
      route: "/api/compliance/audit",
      userId: session.user.id,
      teamId,
      logCount: logs.length,
      status: 200,
    });

    return NextResponse.json({
      logs,
      limit,
      offset,
      count: logs.length,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/compliance/audit",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to retrieve audit logs" },
      { status: 500 },
    );
  }
}
