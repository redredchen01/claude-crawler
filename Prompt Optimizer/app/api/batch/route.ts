import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { listBatchJobs } from "@/lib/batchOptimization";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await listBatchJobs(session.user.id, teamId, limit, offset);

    logger.info(
      {
        userId: session.user.id,
        teamId,
        jobCount: result.jobs.length,
      },
      "Batch jobs listed",
    );

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch",
        error: error.message,
      },
      "Failed to list batch jobs",
    );

    return NextResponse.json(
      { error: "Failed to list batch jobs" },
      { status: 500 },
    );
  }
}
