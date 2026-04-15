import { metricsCollector } from "@/lib/metrics";

describe("MetricsCollector", () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  describe("recordRateLimitHit", () => {
    it("increments rate limit hits total", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      expect(metricsCollector.getRateLimitHitsTotal()).toBe(1);
    });

    it("records multiple hits", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      metricsCollector.recordRateLimitHit("user456", "score", resetAt);
      expect(metricsCollector.getRateLimitHitsTotal()).toBe(2);
    });
  });

  describe("recordWebhookDelivery", () => {
    it("tracks successful deliveries", () => {
      metricsCollector.recordWebhookDelivery(true);
      expect(metricsCollector.getWebhookSuccessRate()).toBe(1.0);
    });

    it("tracks failed deliveries", () => {
      metricsCollector.recordWebhookDelivery(false);
      expect(metricsCollector.getWebhookSuccessRate()).toBe(0);
    });

    it("calculates success rate correctly", () => {
      metricsCollector.recordWebhookDelivery(true);
      metricsCollector.recordWebhookDelivery(true);
      metricsCollector.recordWebhookDelivery(false);
      expect(metricsCollector.getWebhookSuccessRate()).toBeCloseTo(0.667, 2);
    });
  });

  describe("getAverageRateLimitResetSeconds", () => {
    it("returns 0 for no recorded limits", () => {
      expect(metricsCollector.getAverageRateLimitResetSeconds()).toBe(0);
    });

    it("calculates average reset time correctly", () => {
      const now = Date.now();
      const resetAt1 = new Date(now + 1000);
      const resetAt2 = new Date(now + 3000);

      metricsCollector.recordRateLimitHit("user1", "endpoint1", resetAt1);
      metricsCollector.recordRateLimitHit("user2", "endpoint2", resetAt2);

      const avg = metricsCollector.getAverageRateLimitResetSeconds();
      expect(avg).toBeGreaterThan(1);
      expect(avg).toBeLessThan(3);
    });
  });

  describe("formatPrometheus", () => {
    it("returns valid Prometheus format", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      metricsCollector.recordWebhookDelivery(true);

      const output = metricsCollector.formatPrometheus();
      expect(output).toContain("rate_limit_hits_total");
      expect(output).toContain("rate_limit_reset_seconds");
      expect(output).toContain("webhook_delivery_success_rate");
      expect(output).toContain("# HELP");
      expect(output).toContain("# TYPE");
    });

    it("includes correct counter values", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      metricsCollector.recordRateLimitHit("user456", "score", resetAt);

      const output = metricsCollector.formatPrometheus();
      expect(output).toContain("rate_limit_hits_total 2");
    });
  });

  describe("getSnapshot", () => {
    it("returns all metrics in snapshot", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      metricsCollector.recordWebhookDelivery(true);
      metricsCollector.recordWebhookDelivery(false);

      const snapshot = metricsCollector.getSnapshot();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.rateLimitHits).toBe(1);
      expect(snapshot.webhookSuccessRate).toBe(0.5);
    });
  });

  describe("reset", () => {
    it("clears all metrics", () => {
      const resetAt = new Date(Date.now() + 3600000);
      metricsCollector.recordRateLimitHit("user123", "optimize-full", resetAt);
      metricsCollector.recordWebhookDelivery(true);

      metricsCollector.reset();

      expect(metricsCollector.getRateLimitHitsTotal()).toBe(0);
      expect(metricsCollector.getWebhookSuccessRate()).toBe(1.0);
      expect(metricsCollector.getAverageRateLimitResetSeconds()).toBe(0);
    });
  });
});
