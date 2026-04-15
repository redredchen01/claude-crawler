import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getTeamById } from "@/lib/teams";
import { generateApiKey, listApiKeys, ApiKeyScope } from "@/lib/apiKeyScoping";
import { createAuditLog, AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { teamId, scopes, ipWhitelist, expiresAt } = body;

    // Validate scopes
    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json(
        { error: "At least one scope is required" },
        { status: 400 },
      );
    }

    // Validate scope values
    const validScopes = Object.values(ApiKeyScope);
    if (!scopes.every((s: string) => (validScopes as any[]).includes(s))) {
      return NextResponse.json(
        { error: "Invalid scope values" },
        { status: 400 },
      );
    }

    // If teamId provided, verify user is team admin
    if (teamId) {
      const team = await getTeamById(teamId, session.user.id);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found or access denied" },
          { status: 403 },
        );
      }

      const isAdmin = team.members?.some(
        (m) => m.userId === session.user.id && m.role === "admin",
      );
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: "Only team admins can create team API keys",
          },
          { status: 403 },
        );
      }
    }

    // Generate new API key
    const newKey = await generateApiKey(session.user.id, teamId, scopes, {
      ipWhitelist,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Log the key creation
    await createAuditLog(
      session.user.id,
      AuditAction.API_KEY_CREATED,
      "api_key",
      "new-key",
      {
        teamId,
        status: "success",
        ipAddress: request.headers.get("x-forwarded-for") || undefined,
      },
    );

    logger.info({ userId: session.user.id, teamId, scopes }, "API key created");

    return NextResponse.json(
      {
        key: newKey,
        scopes,
        teamId,
        message:
          "Save this key securely. You will not be able to see it again.",
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error({
      route: "/api/keys",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    // If teamId provided, verify user is team member
    if (teamId) {
      const team = await getTeamById(teamId, session.user.id);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found or access denied" },
          { status: 403 },
        );
      }
    }

    // List API keys
    const keys = await listApiKeys(session.user.id, teamId || undefined);

    logger.info(
      { userId: session.user.id, keyCount: keys.length },
      "API keys listed",
    );

    return NextResponse.json({
      keys,
      count: keys.length,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/keys",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to list API keys" },
      { status: 500 },
    );
  }
}
