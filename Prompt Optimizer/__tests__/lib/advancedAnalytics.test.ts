import { prisma } from "@/lib/db";
import {
  getBatchAnalytics,
  getPerformanceMetrics,
  getCostAnalysis,
  getAnalyticsByDateRange,
  exportAnalyticsAsCSV,
} from "@/lib/advancedAnalytics";

describe("Advanced Analytics Service", () => {
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `analytics-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: `Analytics Team ${Date.now()}`,
        slug: `analytics-${Date.now()}`,
      },
    });
    testTeamId = team.id;

    // Add user to team
    await prisma.teamMember.create({
      data: {
        teamId: testTeamId,
        userId: testUserId,
        role: "admin",
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.batchOptimizationJob.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.teamMember.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.team.deleteMany({
      where: { id: testTeamId },
    });
  });

  beforeEach(async () => {
    // Create sample batch jobs for testing
    for (let i = 0; i < 3; i++) {
      await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "completed",
          totalItems: 10,
          processedItems: 8 + i,
          failedItems: 2 - i,
          batchName: `Test Batch ${i}`,
          prompts: JSON.stringify(Array(10).fill("Test prompt")),
          startedAt: new Date(Date.now() - 300000),
          completedAt: new Date(),
        },
      });
    }
  });

  describe("getBatchAnalytics", () => {
    test("should return batch analytics for user", async () => {
      const analytics = await getBatchAnalytics(testUserId);

      expect(analytics).toHaveProperty("totalBatches");
      expect(analytics).toHaveProperty("completedBatches");
      expect(analytics).toHaveProperty("totalPrompts");
      expect(analytics).toHaveProperty("successfulPrompts");
      expect(analytics).toHaveProperty("successRate");
      expect(analytics.totalBatches).toBeGreaterThan(0);
    });

    test("should filter by teamId if provided", async () => {
      const analytics = await getBatchAnalytics(testUserId, testTeamId);

      expect(analytics.totalBatches).toBeGreaterThan(0);
    });

    test("should calculate success rate correctly", async () => {
      const analytics = await getBatchAnalytics(testUserId, testTeamId);

      if (analytics.totalPrompts > 0) {
        expect(analytics.successRate).toBeGreaterThanOrEqual(0);
        expect(analytics.successRate).toBeLessThanOrEqual(100);
      }
    });

    test("should return zero analytics for non-existent user", async () => {
      const analytics = await getBatchAnalytics("non-existent-user");

      expect(analytics.totalBatches).toBe(0);
      expect(analytics.totalPrompts).toBe(0);
    });
  });

  describe("getPerformanceMetrics", () => {
    test("should return performance metrics", async () => {
      const metrics = await getPerformanceMetrics(testUserId, testTeamId);

      if (metrics) {
        expect(metrics).toHaveProperty("avgProcessingTimeMs");
        expect(metrics).toHaveProperty("minProcessingTimeMs");
        expect(metrics).toHaveProperty("maxProcessingTimeMs");
        expect(metrics).toHaveProperty("medianProcessingTimeMs");
        expect(metrics).toHaveProperty("p95ProcessingTimeMs");
        expect(metrics).toHaveProperty("p99ProcessingTimeMs");
      }
    });

    test("should return null for user with no completed jobs", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `other-user-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const metrics = await getPerformanceMetrics(otherUser.id);

      expect(metrics).toBeNull();

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    test("should calculate percentiles correctly", async () => {
      const metrics = await getPerformanceMetrics(testUserId, testTeamId);

      if (metrics) {
        expect(metrics.p95ProcessingTimeMs).toBeGreaterThanOrEqual(
          metrics.minProcessingTimeMs,
        );
        expect(metrics.p99ProcessingTimeMs).toBeGreaterThanOrEqual(
          metrics.p95ProcessingTimeMs,
        );
      }
    });
  });

  describe("getCostAnalysis", () => {
    test("should return cost analysis", async () => {
      const cost = await getCostAnalysis(testUserId, testTeamId);

      expect(cost).toHaveProperty("estimatedTokensProcessed");
      expect(cost).toHaveProperty("estimatedCost");
      expect(cost).toHaveProperty("costPerBatch");
      expect(cost).toHaveProperty("costPerPrompt");
      expect(cost.estimatedTokensProcessed).toBeGreaterThanOrEqual(0);
      expect(cost.estimatedCost).toBeGreaterThanOrEqual(0);
    });

    test("should calculate costs based on token estimates", async () => {
      const cost = await getCostAnalysis(testUserId, testTeamId, 1.0); // $1 per 1M tokens

      if (cost.estimatedTokensProcessed > 0) {
        expect(cost.costPerPrompt).toBeGreaterThan(0);
        expect(cost.costPerBatch).toBeGreaterThan(0);
      }
    });

    test("should use custom cost per million tokens", async () => {
      const cost2 = await getCostAnalysis(testUserId, testTeamId, 2.0);
      const cost1 = await getCostAnalysis(testUserId, testTeamId, 1.0);

      expect(cost2.estimatedCost).toBeGreaterThanOrEqual(cost1.estimatedCost);
    });
  });

  describe("getAnalyticsByDateRange", () => {
    test("should return analytics grouped by date", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date();

      const analytics = await getAnalyticsByDateRange(
        testUserId,
        startDate,
        endDate,
        testTeamId,
      );

      expect(Array.isArray(analytics)).toBe(true);
      if (analytics.length > 0) {
        expect(analytics[0]).toHaveProperty("date");
        expect(analytics[0]).toHaveProperty("batchCount");
        expect(analytics[0]).toHaveProperty("promptCount");
      }
    });

    test("should return empty array for future date range", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 2);

      const analytics = await getAnalyticsByDateRange(
        testUserId,
        startDate,
        endDate,
        testTeamId,
      );

      expect(analytics.length).toBe(0);
    });

    test("should sort results by date", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const analytics = await getAnalyticsByDateRange(
        testUserId,
        startDate,
        endDate,
        testTeamId,
      );

      for (let i = 0; i < analytics.length - 1; i++) {
        expect(analytics[i].date.getTime()).toBeLessThanOrEqual(
          analytics[i + 1].date.getTime(),
        );
      }
    });
  });

  describe("exportAnalyticsAsCSV", () => {
    test("should export analytics as CSV", async () => {
      const csv = await exportAnalyticsAsCSV(testUserId, testTeamId);

      expect(typeof csv).toBe("string");
      expect(csv).toContain("Batch Analytics Report");
      expect(csv).toContain("Overview");
      expect(csv).toContain("Prompts");
    });

    test("should include all analytics sections", async () => {
      const csv = await exportAnalyticsAsCSV(testUserId, testTeamId);

      expect(csv).toContain("Total Batches");
      expect(csv).toContain("Success Rate");
      expect(csv).toContain("Performance");
      expect(csv).toContain("Cost Analysis");
    });

    test("should be valid CSV format", async () => {
      const csv = await exportAnalyticsAsCSV(testUserId, testTeamId);
      const lines = csv.split("\n");

      expect(lines.length).toBeGreaterThan(0);
      expect(csv).toContain(","); // Should have comma-separated values
    });
  });
});
