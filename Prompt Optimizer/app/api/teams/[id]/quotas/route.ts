import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { getTeamQuota, updateTeamQuota } from "@/lib/teams";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import { buildErrorResponse, formatRateLimitHeaders } from "@/lib/routeHelpers";
import crypto from "crypto";

/**
 * GET /api/teams/:id/quotas
 * View team quota and current usage
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 },
      );
    }

    // Verify user is member of team
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Team not found or unauthorized" },
        { status: 404 },
      );
    }

    const quota = await getTeamQuota(params.id);

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/quotas`,
      method: "GET",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      monthlyLimit: quota.monthlyLimit,
      currentUsage: quota.currentUsage,
      duration_ms: duration,
    });

    const response = NextResponse.json({
      quota: {
        id: quota.id,
        teamId: quota.teamId,
        monthlyLimit: quota.monthlyLimit,
        currentUsage: quota.currentUsage,
        remaining: Math.max(0, quota.monthlyLimit - quota.currentUsage),
        percentUsed: ((quota.currentUsage / quota.monthlyLimit) * 100).toFixed(
          1,
        ),
        resetAt: quota.resetAt,
      },
    });

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/teams/${params.id}/quotas`,
      requestId,
      duration,
      undefined,
      "Failed to fetch team quota",
    );
  }
}

/**
 * PATCH /api/teams/:id/quotas
 * Update team monthly quota (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { monthlyLimit } = body;

    if (
      typeof monthlyLimit !== "number" ||
      monthlyLimit < 100 ||
      monthlyLimit > 10000000
    ) {
      return NextResponse.json(
        { error: "monthlyLimit must be a number between 100 and 10,000,000" },
        { status: 400 },
      );
    }

    const quota = await updateTeamQuota(
      params.id,
      session.user.id,
      monthlyLimit,
    );

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/quotas`,
      method: "PATCH",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      newMonthlyLimit: monthlyLimit,
      duration_ms: duration,
    });

    const response = NextResponse.json({
      quota: {
        id: quota.id,
        teamId: quota.teamId,
        monthlyLimit: quota.monthlyLimit,
        currentUsage: quota.currentUsage,
        remaining: Math.max(0, quota.monthlyLimit - quota.currentUsage),
        percentUsed: ((quota.currentUsage / quota.monthlyLimit) * 100).toFixed(
          1,
        ),
        resetAt: quota.resetAt,
      },
    });

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.message?.includes("not authorized")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return buildErrorResponse(
      error,
      `/api/teams/${params.id}/quotas`,
      requestId,
      duration,
      undefined,
      "Failed to update team quota",
    );
  }
}
