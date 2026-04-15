import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { exportUserData, createAuditLog, AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Export user data
    const data = await exportUserData(session.user.id);

    // Log the data export request
    await createAuditLog(
      session.user.id,
      AuditAction.DATA_EXPORT_REQUESTED,
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
      "Data export completed",
    );

    // Return as downloadable JSON file
    const filename = `data-export-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    logger.error({
      route: "/api/compliance/data-export",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to export user data" },
      { status: 500 },
    );
  }
}
