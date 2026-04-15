import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  revokeApiKey,
  rotateApiKey,
  updateApiKeyIpWhitelist,
} from "@/lib/apiKeyScoping";
import { createAuditLog, AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAuth();

    await revokeApiKey(params.id, session.user.id);

    // Log the revocation
    await createAuditLog(
      session.user.id,
      AuditAction.API_KEY_DELETED,
      "api_key",
      params.id,
      {
        status: "success",
        ipAddress: request.headers.get("x-forwarded-for") || undefined,
      },
    );

    logger.info(
      { userId: session.user.id, keyId: params.id },
      "API key revoked",
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({
      route: `/api/keys/${params.id}`,
      error: error.message,
    });

    if (error.message.includes("not found")) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { action, ips } = body;

    if (action === "rotate") {
      const newKey = await rotateApiKey(params.id, session.user.id);

      await createAuditLog(
        session.user.id,
        AuditAction.API_KEY_ROTATED,
        "api_key",
        params.id,
        {
          status: "success",
          ipAddress: request.headers.get("x-forwarded-for") || undefined,
        },
      );

      logger.info(
        { userId: session.user.id, keyId: params.id },
        "API key rotated",
      );

      return NextResponse.json({
        key: newKey,
        message: "API key rotated successfully. Save the new key securely.",
      });
    } else if (action === "updateIps") {
      if (!Array.isArray(ips)) {
        return NextResponse.json(
          { error: "ips must be an array" },
          { status: 400 },
        );
      }

      await updateApiKeyIpWhitelist(params.id, session.user.id, ips);

      await createAuditLog(
        session.user.id,
        AuditAction.API_KEY_SCOPE_CHANGED,
        "api_key",
        params.id,
        {
          status: "success",
          ipAddress: request.headers.get("x-forwarded-for") || undefined,
        },
      );

      logger.info(
        { userId: session.user.id, keyId: params.id },
        "API key IP whitelist updated",
      );

      return NextResponse.json({
        success: true,
        message: "IP whitelist updated",
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'rotate' or 'updateIps'" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    logger.error({
      route: `/api/keys/${params.id}`,
      error: error.message,
    });

    if (error.message.includes("not found")) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 },
    );
  }
}
