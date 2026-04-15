import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithAudit } from "@/lib/adminAuth";
import { getBatchJobTimeline } from "@/lib/adminDashboard";
import { AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

/**
 * GET /api/admin/batches/[id]/timeline
 * Admin-only endpoint for single batch job progress timeline
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAdminWithAudit(
      request,
      AuditAction.ADMIN_DASHBOARD_VIEWED,
      "batch_job_timeline",
    );
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 },
      );
    }

    const timeline = await getBatchJobTimeline(jobId);

    logger.info(
      {
        userId: session.user.id,
        jobId,
        route: "/api/admin/batches/[id]/timeline",
      },
      "Admin batch job timeline retrieved",
    );

    return NextResponse.json(timeline);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/admin/batches/[id]/timeline",
        error: error.message,
      },
      "Failed to retrieve batch job timeline",
    );

    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error.message === "Batch job not found") {
      return NextResponse.json(
        { error: "Batch job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to retrieve batch job timeline" },
      { status: 500 },
    );
  }
}
