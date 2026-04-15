import { NextRequest, NextResponse } from "next/server";
import { getMetricsString } from "@/lib/metrics";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const metrics = await getMetricsString();

    return new NextResponse(metrics, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error: any) {
    logger.error({ route: "/api/metrics", error: error.message }, "Failed to retrieve metrics");
    return NextResponse.json({ error: "Failed to retrieve metrics" }, { status: 500 });
  }
}
