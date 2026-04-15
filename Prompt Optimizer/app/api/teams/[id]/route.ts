import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { getTeamById, updateTeamQuota } from "@/lib/teams";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import { buildErrorResponse, formatRateLimitHeaders } from "@/lib/routeHelpers";
import crypto from "crypto";

/**
 * GET /api/teams/:id
 * Get team details
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

    const team = await getTeamById(params.id, session.user.id);

    if (!team) {
      return NextResponse.json(
        { error: "Team not found or unauthorized" },
        { status: 404 },
      );
    }

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}`,
      method: "GET",
      userId: session.user.id,
      request_id: requestId,
      teamId: team.id,
      duration_ms: duration,
    });

    const response = NextResponse.json(team);

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/teams/${params.id}`,
      requestId,
      duration,
      undefined,
      "Failed to fetch team",
    );
  }
}

/**
 * PATCH /api/teams/:id
 * Update team (admin only)
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

    // Verify user is admin
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.user.id,
      },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only team admins can update team details" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name } = body;

    if (
      !name ||
      typeof name !== "string" ||
      name.length < 1 ||
      name.length > 100
    ) {
      return NextResponse.json(
        { error: "Team name must be 1-100 characters" },
        { status: 400 },
      );
    }

    const team = await prisma.team.update({
      where: { id: params.id },
      data: { name },
    });

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}`,
      method: "PATCH",
      userId: session.user.id,
      request_id: requestId,
      teamId: team.id,
      duration_ms: duration,
    });

    const response = NextResponse.json(team);

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/teams/${params.id}`,
      requestId,
      duration,
      undefined,
      "Failed to update team",
    );
  }
}

/**
 * DELETE /api/teams/:id
 * Delete team (admin only, cascade deletes members and quotas)
 */
export async function DELETE(
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

    // Verify user is admin
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.user.id,
      },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only team admins can delete teams" },
        { status: 403 },
      );
    }

    // Delete team (cascades to members and quotas)
    const team = await prisma.team.delete({
      where: { id: params.id },
    });

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}`,
      method: "DELETE",
      userId: session.user.id,
      request_id: requestId,
      teamId: team.id,
      duration_ms: duration,
    });

    return NextResponse.json({ success: true, message: "Team deleted" });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/teams/${params.id}`,
      requestId,
      duration,
      undefined,
      "Failed to delete team",
    );
  }
}
