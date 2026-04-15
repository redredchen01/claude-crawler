import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getBatchJob, cancelBatchJob } from "@/lib/batchOptimization";
import logger from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAuth();
    const { id } = params;

    const job = await getBatchJob(id, session.user.id);

    if (!job) {
      return NextResponse.json(
        { error: "Batch job not found or access denied" },
        { status: 404 },
      );
    }

    logger.info(
      {
        userId: session.user.id,
        jobId: id,
      },
      "Batch job details retrieved",
    );

    return NextResponse.json(job);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch/[id]",
        error: error.message,
      },
      "Failed to retrieve batch job",
    );

    return NextResponse.json(
      { error: "Failed to retrieve batch job" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAuth();
    const { id } = params;
    const body = await request.json();
    const { action } = body;

    if (action === "cancel") {
      await cancelBatchJob(id, session.user.id);

      logger.info(
        {
          userId: session.user.id,
          jobId: id,
        },
        "Batch job cancelled",
      );

      return NextResponse.json({ status: "cancelled" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch/[id]",
        error: error.message,
      },
      "Failed to process batch job action",
    );

    const status = error.message?.includes("access denied")
      ? 403
      : error.message?.includes("completed")
        ? 400
        : 500;

    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status },
    );
  }
}
