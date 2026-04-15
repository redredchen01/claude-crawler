import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithAudit } from "@/lib/adminAuth";
import { AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";
import { getCachedStats } from "@/lib/adminCache";

/**
 * GET /api/admin/batches/stats
 * Admin-only endpoint for aggregated batch statistics
 * Uses intelligent caching with background pre-warming (30s TTL)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminWithAudit(
      request,
      AuditAction.ADMIN_BATCH_STATS_VIEWED,
      "batch_stats",
    );

    // Get stats with intelligent caching and background refresh
    const stats = await getCachedStats();

    logger.info(
      { userId: session.user.id, route: "/api/admin/batches/stats" },
      "Admin batch stats retrieved",
    );

    return NextResponse.json(stats);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/admin/batches/stats",
        error: error.message,
      },
      "Failed to retrieve batch stats",
    );

    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to retrieve batch stats" },
      { status: 500 },
    );
  }
}
