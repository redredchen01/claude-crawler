import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET() {
  const start = Date.now();
  try {
    await requireAdmin();

    // Get stats
    const [userCount, recordCount] = await Promise.all([
      prisma.user.count(),
      prisma.optimizationRecord.count(),
    ]);

    const recordsByUser = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        _count: {
          select: { records: true },
        },
      },
    });

    logger.info(
      {
        route: "/api/admin/stats",
        duration_ms: Date.now() - start,
        status: 200,
      },
      "route success",
    );

    return NextResponse.json({
      stats: {
        totalUsers: userCount,
        totalOptimizations: recordCount,
        recordsByUser: recordsByUser.map((u) => ({
          email: u.email,
          count: u._count.records,
        })),
      },
    });
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("Admin") ? 403 : 401 },
      );
    }
    logger.error({ route: "/api/admin/stats", error: error.message });
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
