import { GET } from "@/app/api/metrics/route";
import { metricsCollector } from "@/lib/metrics";
import { NextRequest } from "next/server";

describe("GET /api/metrics", () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  it("returns Prometheus format metrics", async () => {
    const request = new NextRequest("http://localhost:3000/api/metrics", {
      method: "GET",
    });

    const response = await GET(request);
    const text = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; version=0.0.4",
    );
    expect(text).toContain("rate_limit_hits_total");
    expect(text).toContain("rate_limit_reset_seconds");
    expect(text).toContain("webhook_delivery_success_rate");
  });

  it("returns metrics data from collector", async () => {
    const resetAt = new Date(Date.now() + 3600000);
    metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
    metricsCollector.recordWebhookDelivery(true);

    const request = new NextRequest("http://localhost:3000/api/metrics", {
      method: "GET",
    });

    const response = await GET(request);
    const text = await response.text();

    expect(text).toContain("rate_limit_hits_total 1");
    expect(text).toContain("webhook_delivery_success_rate 1.00");
  });

  it("uses correct status code", async () => {
    const request = new NextRequest("http://localhost:3000/api/metrics", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
