import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithAudit } from "@/lib/adminAuth";
import { listBatches } from "@/lib/adminDashboard";
import { AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

/**
 * GET /api/admin/batches?status=completed&limit=50&offset=0
 * Admin-only endpoint for paginated batch listing with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminWithAudit(
      request,
      AuditAction.ADMIN_DASHBOARD_VIEWED,
      "batch_list",
    );
    const url = new URL(request.url);

    const filters = {
      status: url.searchParams.get("status") || undefined,
      userId: url.searchParams.get("userId") || undefined,
      teamId: url.searchParams.get("teamId") || undefined,
      limit: parseInt(url.searchParams.get("limit") || "50", 10),
      offset: parseInt(url.searchParams.get("offset") || "0", 10),
    };

    // Validate pagination parameters
    if (isNaN(filters.limit) || filters.limit < 1 || filters.limit > 100) {
      return NextResponse.json(
        { error: "Invalid limit parameter (1-100)" },
        { status: 400 },
      );
    }

    if (isNaN(filters.offset) || filters.offset < 0) {
      return NextResponse.json(
        { error: "Invalid offset parameter" },
        { status: 400 },
      );
    }

    const { batches, total } = await listBatches(filters);

    logger.info(
      {
        userId: session.user.id,
        route: "/api/admin/batches",
        batchCount: batches.length,
        total,
      },
      "Admin batch list retrieved",
    );

    return NextResponse.json({
      batches,
      total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/admin/batches",
        error: error.message,
      },
      "Failed to retrieve batch list",
    );

    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to retrieve batch list" },
      { status: 500 },
    );
  }
}
