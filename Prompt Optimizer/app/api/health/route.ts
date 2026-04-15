import { NextRequest, NextResponse } from "next/server";
import { getCacheStats } from "@/lib/adminCache";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    try {
      const cacheStats = getCacheStats();
      health.cache = {
        status: cacheStats.activeKeys > 0 ? "healthy" : "empty",
        activeKeys: cacheStats.activeKeys,
        staleCaches: cacheStats.staleCaches,
        refreshing: cacheStats.refreshingCaches,
      };
    } catch (err: any) {
      health.cache = { status: "error", message: err.message };
    }

    try {
      const result = await prisma.$queryRaw`SELECT 1`;
      health.database = { status: "healthy" };
    } catch (err: any) {
      health.database = { status: "error", message: err.message };
    }

    const memUsage = process.memoryUsage();
    health.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    health.responseTime = Date.now() - startTime;

    const statusCode = health.cache?.status === "error" || health.database?.status === "error" ? 503 : 200;

    return NextResponse.json(health, { status: statusCode });
  } catch (error: any) {
    logger.error({ error: error.message }, "Health check failed");
    return NextResponse.json({ status: "error", message: error.message }, { status: 503 });
  }
}
