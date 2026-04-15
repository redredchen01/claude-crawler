import { NextRequest, NextResponse } from "next/server";
import { scorePromptService } from "@/lib/services/scoring";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import logger from "@/lib/logger";
import crypto from "crypto";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
  validatePromptInput,
} from "@/lib/routeHelpers";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();

    // Check rate limit
    const rateLimit = await checkRateLimit(session.user.id, "score");
    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        "/api/score",
        session.user.id,
        requestId,
      );
    }

    const body = await request.json();
    const { raw_prompt } = body;

    // Validate input
    const validation = validatePromptInput(raw_prompt, 50000);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const score = await scorePromptService(raw_prompt);
    const duration = Date.now() - startTime;

    logger.info({
      route: "/api/score",
      userId: session.user.id,
      request_id: requestId,
      duration_ms: duration,
      status: 200,
      score_total: (score as any).total,
    });

    const response = NextResponse.json(score);
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    response.headers.set(
      "X-Deprecation-Warning",
      "This endpoint is deprecated. Migrate to API key authentication. Session-based endpoints will sunset in 6 months.",
    );
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      "/api/score",
      requestId,
      duration,
      undefined,
      "Failed to score prompt",
    );
  }
}
