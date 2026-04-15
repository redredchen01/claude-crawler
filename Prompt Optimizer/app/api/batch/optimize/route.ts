import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { createBatchJob } from "@/lib/batchOptimization";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const { prompts, batchName, teamId } = body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json(
        { error: "Prompts must be a non-empty array" },
        { status: 400 },
      );
    }

    const job = await createBatchJob(
      session.user.id,
      teamId || undefined,
      prompts,
      batchName,
    );

    logger.info(
      {
        userId: session.user.id,
        jobId: job.id,
        promptCount: prompts.length,
      },
      "Batch optimization job created via API",
    );

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch/optimize",
        error: error.message,
      },
      "Failed to create batch job",
    );

    const status = error.message?.includes("Batch")
      ? 400
      : error.message?.includes("access denied")
        ? 403
        : 500;

    return NextResponse.json(
      { error: error.message || "Failed to create batch job" },
      { status },
    );
  }
}
