import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { removeTeamMember } from "@/lib/teams";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import { buildErrorResponse, formatRateLimitHeaders } from "@/lib/routeHelpers";
import crypto from "crypto";

/**
 * PATCH /api/teams/:id/members/:userId
 * Update member role (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } },
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

    // Verify requester is admin
    const requesterMembership = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.user.id,
      },
    });

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only team admins can update member roles" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { role } = body;

    if (!role || !["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'admin', 'editor', or 'viewer'" },
        { status: 400 },
      );
    }

    // Get current member
    const member = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: params.userId,
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent removing last admin
    if (member.role === "admin" && role !== "admin") {
      const adminCount = await prisma.teamMember.count({
        where: {
          teamId: params.id,
          role: "admin",
        },
      });

      if (adminCount === 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin from team" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: { role },
    });

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/members/${params.userId}`,
      method: "PATCH",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      targetUserId: params.userId,
      newRole: role,
      duration_ms: duration,
    });

    const response = NextResponse.json(updated);

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/teams/${params.id}/members/${params.userId}`,
      requestId,
      duration,
      undefined,
      "Failed to update member role",
    );
  }
}

/**
 * DELETE /api/teams/:id/members/:userId
 * Remove team member (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } },
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

    await removeTeamMember(params.id, session.user.id, params.userId);

    const duration = Date.now() - startTime;

    logger.info({
      route: `/api/teams/${params.id}/members/${params.userId}`,
      method: "DELETE",
      userId: session.user.id,
      request_id: requestId,
      teamId: params.id,
      removedUserId: params.userId,
      duration_ms: duration,
    });

    return NextResponse.json({ success: true, message: "Member removed" });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.message?.includes("not authorized")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error.message?.includes("Cannot remove")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return buildErrorResponse(
      error,
      `/api/teams/${params.id}/members/${params.userId}`,
      requestId,
      duration,
      undefined,
      "Failed to remove member",
    );
  }
}
