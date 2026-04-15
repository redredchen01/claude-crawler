import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithAudit } from "@/lib/adminAuth";
import { AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";
import { getCachedTimeline } from "@/lib/adminCache";

/**
 * GET /api/admin/batches/timeline?hoursBack=24
 * Admin-only endpoint for batch completion timeline (hourly aggregation)
 * Uses intelligent caching with background pre-warming (60s TTL)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminWithAudit(
      request,
      AuditAction.ADMIN_BATCH_TIMELINE_VIEWED,
      "batch_timeline",
    );
    const url = new URL(request.url);
    const hoursBack = parseInt(url.searchParams.get("hoursBack") || "24", 10);

    if (isNaN(hoursBack) || hoursBack < 1 || hoursBack > 720) {
      return NextResponse.json(
        { error: "Invalid hoursBack parameter (1-720)" },
        { status: 400 },
      );
    }

    // Get timeline with intelligent caching and background refresh
    const timeline = await getCachedTimeline(hoursBack);

    logger.info(
      {
        userId: session.user.id,
        route: "/api/admin/batches/timeline",
        hoursBack,
      },
      "Admin batch timeline retrieved",
    );

    return NextResponse.json({ hoursBack, points: timeline });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/admin/batches/timeline",
        error: error.message,
      },
      "Failed to retrieve batch timeline",
    );

    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to retrieve batch timeline" },
      { status: 500 },
    );
  }
}
