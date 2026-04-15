import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { cancelJob } from "@/lib/jobs";
import logger from "@/lib/logger";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
} from "@/lib/routeHelpers";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        `/api/optimize-full/${params.jobId}/cancel`,
        session.user.id,
        requestId,
      );
    }

    const success = await cancelJob(params.jobId, session.user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Job not found or already cancelled" },
        { status: 404 },
      );
    }

    const duration = Date.now() - startTime;
    logger.info({
      route: `/api/optimize-full/${params.jobId}/cancel`,
      method: "POST",
      userId: session.user.id,
      jobId: params.jobId,
      duration_ms: duration,
    });

    const response = NextResponse.json(
      { success: true, message: "Job cancelled successfully" },
      { status: 200 },
    );
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/optimize-full/${params.jobId}/cancel`,
      requestId,
      duration,
      undefined,
      "Failed to cancel job",
    );
  }
}
