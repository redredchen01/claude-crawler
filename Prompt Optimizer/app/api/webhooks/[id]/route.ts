import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import logger from "@/lib/logger";
import { buildErrorResponse, formatRateLimitHeaders } from "@/lib/routeHelpers";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth();
    const rateLimit = await checkRateLimit(session.user.id, "score");

    // Verify ownership
    const webhook = await prisma.webhookConfig.findUnique({
      where: { id: params.id },
    });

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    if (webhook.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete webhook and associated events
    await Promise.all([
      prisma.webhookEvent.deleteMany({ where: { configId: params.id } }),
      prisma.webhookConfig.delete({ where: { id: params.id } }),
    ]);

    const duration = Date.now() - startTime;
    logger.info({
      route: `/api/webhooks/${params.id}`,
      method: "DELETE",
      userId: session.user.id,
      duration_ms: duration,
      status: 200,
    });

    const response = NextResponse.json({ success: true }, { status: 200 });
    const headers = formatRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(
      error,
      `/api/webhooks/${params.id}`,
      requestId,
      duration,
      undefined,
      "Failed to delete webhook",
    );
  }
}
