import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { createTeam, listUserTeams } from "@/lib/teams";
import logger from "@/lib/logger";
import {
  buildErrorResponse,
  formatRateLimitHeaders,
  validatePromptInput,
} from "@/lib/routeHelpers";
import crypto from "crypto";

/**
 * GET /api/teams
 * List all teams user is member of
 */
export async function GET(request: NextRequest) {
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

    const teams = await listUserTeams(session.user.id);
    const duration = Date.now() - startTime;

    logger.info({
      route: "/api/teams",
      method: "GET",
      userId: session.user.id,
      request_id: requestId,
      teamCount: teams.length,
      duration_ms: duration,
    });

    const response = NextResponse.json({
      teams,
      count: teams.length,
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
      "/api/teams",
      requestId,
      duration,
      undefined,
      "Failed to list teams",
    );
  }
}

/**
 * POST /api/teams
 * Create a new team
 */
export async function POST(request: NextRequest) {
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
    const { name, slug } = body;

    // Validate input
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

    if (!slug || typeof slug !== "string" || !/^[a-z0-9-_]+$/.test(slug)) {
      return NextResponse.json(
        {
          error:
            "Team slug must contain only lowercase letters, numbers, dashes, and underscores",
        },
        { status: 400 },
      );
    }

    const team = await createTeam(session.user.id, name, slug);
    const duration = Date.now() - startTime;

    logger.info({
      route: "/api/teams",
      method: "POST",
      userId: session.user.id,
      request_id: requestId,
      teamId: team.id,
      slug: team.slug,
      duration_ms: duration,
    });

    const response = NextResponse.json(team, { status: 201 });

    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Check for specific errors
    if (error.message?.includes("already taken")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return buildErrorResponse(
      error,
      "/api/teams",
      requestId,
      duration,
      undefined,
      "Failed to create team",
    );
  }
}
