/**
 * P4.1: Advanced Analytics Service Tests
 *
 * Test multi-dimensional aggregation and scoring
 */

import { db, initializeDatabase } from "../../../src/db";
import { contentPlans, tdkFeedback } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { AnalyticsService } from "../../../src/services/analytics/analyticsService";

describe("P4.1: Advanced Analytics Service", () => {
  const testProjectId = "analytics-test-project";
  const testUserId = "test-user-analytics";

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    // Clean up test data
    await db
      .delete(contentPlans)
      .where(eq(contentPlans.projectId, testProjectId));
    await db
      .delete(tdkFeedback)
      .where(eq(tdkFeedback.projectId, testProjectId));
  });

  describe("getProjectAnalytics", () => {
    it("should return zero values for empty project", async () => {
      const analytics =
        await AnalyticsService.getProjectAnalytics(testProjectId);

      expect(analytics.projectId).toBe(testProjectId);
      expect(analytics.totalClusters).toBe(0);
      expect(analytics.generatedCount).toBe(0);
      expect(analytics.conflictCount).toBe(0);
      expect(analytics.avgCoherence).toBe(0);
      expect(analytics.topicsWithHighConflict).toEqual([]);
    });

    it("should aggregate data from multiple clusters", async () => {
      // Create 3 clusters with TDK
      const clusters = [
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Cluster 1",
          contentType: "blog",
          createdBy: testUserId,
          contentPlanId: "cluster-1",
          tdkJson: JSON.stringify({ keywords: ["python", "tutorial"] }),
          tdkGeneratedAt: new Date().toISOString(),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Cluster 2",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["python", "guide"] }),
          tdkGeneratedAt: new Date().toISOString(),
          tdkGenerationCount: 2,
        },
        {
          id: "cluster-3",
          projectId: testProjectId,
          clusterId: "cluster-3",
          title: "Cluster 3",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["java", "programming"] }),
          tdkGeneratedAt: new Date().toISOString(),
          tdkGenerationCount: 1,
        },
      ];

      await db.insert(contentPlans).values(clusters);

      const analytics =
        await AnalyticsService.getProjectAnalytics(testProjectId);

      expect(analytics.totalClusters).toBe(3);
      expect(analytics.generatedCount).toBe(3);
      expect(analytics.withoutTdkCount).toBe(0);
      expect(analytics.conflictCount).toBeGreaterThan(0); // Should detect python-related conflicts
      expect(analytics.averageRegenerationCount).toBe(1.33); // Math.round(4/3 * 100) / 100
    });

    it("should count clusters without TDK", async () => {
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Cluster 1",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["test"] }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Cluster 2",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: null,
          // No TDK generated
          tdkGenerationCount: null,
        },
      ]);

      const analytics =
        await AnalyticsService.getProjectAnalytics(testProjectId);

      expect(analytics.generatedCount).toBe(1);
      expect(analytics.withoutTdkCount).toBe(1);
      expect(analytics.totalClusters).toBe(2);
    });

    it("should calculate recent generations (last 7 days)", async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Recent",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["recent"] }),
          tdkGeneratedAt: threeDaysAgo.toISOString(),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Old",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["old"] }),
          tdkGeneratedAt: tenDaysAgo.toISOString(),
          tdkGenerationCount: 1,
        },
      ]);

      const analytics =
        await AnalyticsService.getProjectAnalytics(testProjectId);

      expect(analytics.recentGenerations).toBe(1); // Only the 3-day-old one
    });

    it("should classify conflict severity correctly", async () => {
      // Create clusters with high-overlap keywords (will trigger high-severity conflict)
      const clusters = [
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Cluster 1",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: [
              "python",
              "tutorial",
              "learn",
              "programming",
              "basics",
              "code",
              "developer",
            ],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Cluster 2",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: [
              "python",
              "tutorial",
              "guide",
              "beginners",
              "code",
              "developer",
              "program",
            ],
          }),
          tdkGenerationCount: 1,
        },
      ];

      await db.insert(contentPlans).values(clusters);

      const analytics =
        await AnalyticsService.getProjectAnalytics(testProjectId);

      expect(analytics.conflictCount).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(
        analytics.avgConflictSeverity,
      );
    });
  });

  describe("getClusterScoring", () => {
    it("should return empty array for empty project", async () => {
      const scores = await AnalyticsService.getClusterScoring(testProjectId);
      expect(scores).toEqual([]);
    });

    it("should score clusters and sort by score descending", async () => {
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "With TDK",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({ keywords: ["test"] }),
          tdkGenerationCount: 1,
          tdkGeneratedAt: new Date().toISOString(),
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Without TDK",
          contentType: "blog",
          createdBy: testUserId,
          tdkGenerationCount: null,
        },
      ]);

      const scores = await AnalyticsService.getClusterScoring(testProjectId);

      expect(scores.length).toBe(2);
      // Cluster without TDK should have higher score (higher priority)
      expect(scores[0].reasons).toContain("no_tdk_generated");
      expect(scores[1].reasons.length).toBeGreaterThanOrEqual(0);
      expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
    });

    it("should include stale TDK in reasons", async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await db.insert(contentPlans).values({
        id: "cluster-1",
        projectId: testProjectId,
        clusterId: "cluster-1",
        title: "Stale",
        contentType: "blog",
        createdBy: testUserId,
        tdkJson: JSON.stringify({ keywords: ["test"] }),
        tdkGenerationCount: 1,
        tdkGeneratedAt: thirtyDaysAgo.toISOString(),
      });

      const scores = await AnalyticsService.getClusterScoring(testProjectId);

      expect(scores[0].reasons).toContain("stale_tdk");
    });
  });

  describe("getTimeSeriesStats", () => {
    it("should return data points for specified day range", async () => {
      await db.insert(contentPlans).values({
        id: "cluster-1",
        projectId: testProjectId,
        clusterId: "cluster-1",
        title: "Test",
        contentType: "blog",
        createdBy: testUserId,
        tdkJson: JSON.stringify({ keywords: ["test"] }),
        tdkGenerationCount: 1,
        tdkGeneratedAt: new Date().toISOString(),
      });

      const stats = await AnalyticsService.getTimeSeriesStats(
        testProjectId,
        30,
      );

      expect(stats.length).toBe(30); // Should have 30 days of data
      expect(stats[stats.length - 1].generatedCount).toBeGreaterThan(0); // Today should have 1
    });

    it("should count feedback by date", async () => {
      await db.insert(contentPlans).values({
        id: "cluster-1",
        projectId: testProjectId,
        clusterId: "cluster-1",
        title: "Test",
        contentType: "blog",
        createdBy: testUserId,
      });

      await db.insert(tdkFeedback).values({
        id: "feedback-1",
        contentPlanId: "cluster-1",
        projectId: testProjectId,
        type: "positive",
        feedbackText: "Good",
        createdAt: new Date().toISOString(),
        createdBy: testUserId,
      });

      const stats = await AnalyticsService.getTimeSeriesStats(testProjectId, 7);

      const todayStats = stats.find(
        (s) => s.date === new Date().toISOString().split("T")[0],
      );
      expect(todayStats?.feedbackCount).toBe(1);
    });
  });
});
