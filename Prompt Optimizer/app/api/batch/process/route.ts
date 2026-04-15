import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  processPendingBatchJobs,
  getBatchProcessingStats,
} from "@/lib/batchProcessor";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check if user is admin (only admins can trigger batch processing)
    if (session.user.role !== "ADMIN") {
      logger.warn(
        { userId: session.user.id },
        "Unauthorized batch processing request",
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await processPendingBatchJobs();

    logger.info(
      {
        userId: session.user.id,
        processed: result.processed,
        failed: result.failed,
      },
      "Batch jobs processed via API",
    );

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch/process",
        error: error.message,
      },
      "Failed to process batch jobs",
    );

    return NextResponse.json(
      { error: "Failed to process batch jobs" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check if user is admin
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const stats = await getBatchProcessingStats();

    logger.info(
      {
        userId: session.user.id,
      },
      "Batch processing stats retrieved",
    );

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/batch/process",
        error: error.message,
      },
      "Failed to retrieve batch processing stats",
    );

    return NextResponse.json(
      { error: "Failed to retrieve stats" },
      { status: 500 },
    );
  }
}
