import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { requestUserDeletion, createAuditLog, AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Request user data deletion (soft delete)
    await requestUserDeletion(session.user.id);

    // Log the deletion request
    await createAuditLog(
      session.user.id,
      AuditAction.DATA_DELETION_REQUESTED,
      "user",
      session.user.id,
      {
        status: "success",
        ipAddress: request.headers.get("x-forwarded-for") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    );

    logger.info(
      { userId: session.user.id, status: 200 },
      "Data deletion requested",
    );

    return NextResponse.json({
      message:
        "Data deletion request received. Your account will be deleted after the retention period.",
      retentionDays: 30,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/compliance/data-deletion",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to process data deletion request" },
      { status: 500 },
    );
  }
}
