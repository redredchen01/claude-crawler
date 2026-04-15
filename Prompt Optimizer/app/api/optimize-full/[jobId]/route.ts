import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { getJobStatus } from "@/lib/jobs";
import logger from "@/lib/logger";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
} from "@/lib/routeHelpers";
import crypto from "crypto";

export async function GET(
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
        `/api/optimize-full/${params.jobId}`,
        session.user.id,
        requestId,
      );
    }

    const status = await getJobStatus(params.jobId, session.user.id);

    if (!status) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const duration = Date.now() - startTime;
    logger.info({
      route: `/api/optimize-full/${params.jobId}`,
      method: "GET",
      userId: session.user.id,
      jobStatus: status.status,
      duration_ms: duration,
    });

    const response = NextResponse.json(status);
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/optimize-full/${params.jobId}`,
      requestId,
      duration,
      undefined,
      "Failed to fetch job status",
    );
  }
}
