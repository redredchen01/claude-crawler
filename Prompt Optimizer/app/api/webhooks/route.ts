import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import { createWebhookSignature } from "@/lib/webhooks";
import logger from "@/lib/logger";
import {
  buildRateLimitErrorResponse,
  buildErrorResponse,
  formatRateLimitHeaders,
} from "@/lib/routeHelpers";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        "/api/webhooks",
        session.user.id,
        requestId,
      );
    }

    const webhooks = await prisma.webhookConfig.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        url: true,
        scope: true,
        active: true,
        createdAt: true,
      },
    });

    const duration = Date.now() - startTime;
    logger.info({
      route: "/api/webhooks",
      method: "GET",
      userId: session.user.id,
      duration_ms: duration,
      webhookCount: webhooks.length,
    });

    const response = NextResponse.json({ webhooks });
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      "/api/webhooks",
      requestId,
      duration,
      undefined,
      "Failed to fetch webhooks",
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(
        rateLimit,
        "/api/webhooks",
        session.user.id,
        requestId,
      );
    }

    const body = await request.json();
    const { url, scope = "all" } = body;

    // Validate input
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required and must be a string" },
        { status: 400 },
      );
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "URL must start with http:// or https://" },
        { status: 400 },
      );
    }

    if (!["score", "optimize-full", "all"].includes(scope)) {
      return NextResponse.json(
        { error: "Invalid scope. Must be 'score', 'optimize-full', or 'all'" },
        { status: 400 },
      );
    }

    // Generate secret for webhook verification
    const secret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhookConfig.create({
      data: {
        userId: session.user.id,
        url,
        scope,
        secret,
        active: true,
      },
      select: {
        id: true,
        url: true,
        scope: true,
        active: true,
        createdAt: true,
      },
    });

    const duration = Date.now() - startTime;
    logger.info({
      route: "/api/webhooks",
      method: "POST",
      userId: session.user.id,
      duration_ms: duration,
      webhookId: webhook.id,
      scope,
    });

    const response = NextResponse.json(webhook, { status: 201 });
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      "/api/webhooks",
      requestId,
      duration,
      undefined,
      "Failed to create webhook",
    );
  }
}
