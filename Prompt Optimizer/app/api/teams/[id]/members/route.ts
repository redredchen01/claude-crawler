import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { addTeamMember } from "@/lib/teams";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import { buildErrorResponse, formatRateLimitHeaders } from "@/lib/routeHelpers";
import crypto from "crypto";

/**
 * GET /api/teams/:id/members
 * List team members
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

    // Get all members with user details
    const members = await prisma.teamMember.findMany({
      where: { teamId: params.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/members`,
      method: "GET",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      memberCount: members.length,
      duration_ms: duration,
    });

    const response = NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      count: members.length,
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
      `/api/teams/${params.id}/members`,
      requestId,
      duration,
      undefined,
      "Failed to list members",
    );
  }
}

/**
 * POST /api/teams/:id/members
 * Add team member (admin only)
 */
export async function POST(
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
    const { userId, role } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (!role || !["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'admin', 'editor', or 'viewer'" },
        { status: 400 },
      );
    }

    const member = await addTeamMember(
      params.id,
      session.user.id,
      userId,
      role,
    );

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/members`,
      method: "POST",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      addedUserId: userId,
      role,
      duration_ms: duration,
    });

    const response = NextResponse.json(member, { status: 201 });

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

    if (error.message?.includes("already a team member")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return buildErrorResponse(
      error,
      `/api/teams/${params.id}/members`,
      requestId,
      duration,
      undefined,
      "Failed to add member",
    );
  }
}
