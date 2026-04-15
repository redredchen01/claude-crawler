/**
 * P3.7.3: Multi-Page TDK Endpoints Tests
 *
 * Test tdk-summary and conflict-report endpoints
 */

import { db, initializeDatabase } from "../../src/db";
import { contentPlans } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createTdkRouter } from "../../src/api/tdk";
import { MockTdkGeneratorService, MockTdkValidatorService } from "./mocks";

describe("P3.7.3: Multi-Page TDK Endpoints", () => {
  const testProjectId = "test-project-multipage";
  const testUserId = "test-user-789";

  let router: ReturnType<typeof createTdkRouter>;
  let cluster1Id: string;
  let cluster2Id: string;
  let cluster3Id: string;

  beforeAll(async () => {
    await initializeDatabase();
    const mockGenerator = new MockTdkGeneratorService();
    const mockValidator = new MockTdkValidatorService();
    router = createTdkRouter(mockGenerator, mockValidator);

    cluster1Id = "cluster-1-multipage";
    cluster2Id = "cluster-2-multipage";
    cluster3Id = "cluster-3-multipage";
  });

  beforeEach(async () => {
    // Create test clusters
    await db.insert(contentPlans).values([
      {
        id: cluster1Id,
        projectId: testProjectId,
        clusterId: cluster1Id,
        title: "Python Programming",
        contentType: "blog",
        createdBy: testUserId,
      },
      {
        id: cluster2Id,
        projectId: testProjectId,
        clusterId: cluster2Id,
        title: "Python Tutorial",
        contentType: "blog",
        createdBy: testUserId,
      },
      {
        id: cluster3Id,
        projectId: testProjectId,
        clusterId: cluster3Id,
        title: "Java Development",
        contentType: "blog",
        createdBy: testUserId,
      },
    ]);

    // Generate TDK for cluster 1 and 2 (with high keyword overlap)
    const generateReq1 = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${cluster1Id}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Python Programming Tutorial",
          keywords: ["python", "programming", "tutorial", "learn", "guide"],
          language: "en",
        }),
      },
    );
    await router.request(generateReq1);

    const generateReq2 = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${cluster2Id}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Python Programming Guide",
          keywords: ["python", "programming", "guide", "tutorial", "basics"],
          language: "en",
        }),
      },
    );
    await router.request(generateReq2);

    // Generate TDK for cluster 3 (different keywords)
    const generateReq3 = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${cluster3Id}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Java Development",
          keywords: ["java", "development", "framework"],
          language: "en",
        }),
      },
    );
    await router.request(generateReq3);
  });

  afterEach(async () => {
    // Clean up test data
    await db
      .delete(contentPlans)
      .where(eq(contentPlans.projectId, testProjectId));
  });

  describe("GET /projects/:projectId/tdk-summary", () => {
    it("should return summary of all clusters with TDK status", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/tdk-summary`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        success?: boolean;
        data?: {
          projectId: string;
          totalClusters: number;
          clustersWithTdk: number;
          clusters: Array<{
            clusterId: string;
            hasGenerated: boolean;
          }>;
        };
      };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data?.projectId).toBe(testProjectId);
      expect(data.data?.totalClusters).toBeGreaterThanOrEqual(3); // At least our 3 clusters
      expect(data.data?.clustersWithTdk).toBeGreaterThanOrEqual(3); // All have TDK generated
      expect(data.data?.clusters.length).toBeGreaterThanOrEqual(3);
      // Verify our clusters are in the results
      const ourClusterIds = [cluster1Id, cluster2Id, cluster3Id];
      const returnedClusterIds =
        data.data?.clusters.map((c) => c.clusterId) || [];
      ourClusterIds.forEach((cid) => {
        expect(returnedClusterIds).toContain(cid);
      });
    });

    it("should include generation count in summary", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/tdk-summary`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          clusters: Array<{
            clusterId: string;
            generationCount: number;
          }>;
        };
      };

      expect(data.data?.clusters[0].generationCount).toBe(1);
    });

    it("should include language info in summary", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/tdk-summary`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          clusters: Array<{
            clusterId: string;
            language: string;
          }>;
        };
      };

      expect(data.data?.clusters[0].language).toBe("en");
    });

    it("should require authentication", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/tdk-summary`,
      );

      const response = await router.request(request);
      expect(response.status).toBe(401);
    });

    it("should include keyword list in summary", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/tdk-summary`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          clusters: Array<{
            clusterId: string;
            keywords: string[];
          }>;
        };
      };

      expect(data.data?.clusters[0].keywords).toBeDefined();
      expect(Array.isArray(data.data?.clusters[0].keywords)).toBe(true);
    });
  });

  describe("GET /projects/:projectId/conflict-report", () => {
    it("should detect conflicts between clusters", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        success?: boolean;
        data?: {
          conflicts: {
            total: number;
            highSeverity: number;
            mediumSeverity: number;
            lowSeverity: number;
            details: Array<{ severity: string }>;
          };
        };
      };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data?.conflicts.total).toBeGreaterThan(0); // Should detect conflicts
    });

    it("should classify conflicts by severity", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          conflicts: {
            total: number;
            highSeverity: number;
            mediumSeverity: number;
            lowSeverity: number;
          };
        };
      };

      const total =
        (data.data?.conflicts.highSeverity || 0) +
        (data.data?.conflicts.mediumSeverity || 0) +
        (data.data?.conflicts.lowSeverity || 0);

      // Total should match sum of severities
      expect(total).toBe(data.data?.conflicts.total);
    });

    it("should calculate topic coherence", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          topicCoherence: {
            avgSimilarity: number;
            redundancyScore: number;
          };
        };
      };

      expect(data.data?.topicCoherence.avgSimilarity).toBeGreaterThanOrEqual(0);
      expect(data.data?.topicCoherence.avgSimilarity).toBeLessThanOrEqual(1);
      expect(data.data?.topicCoherence.redundancyScore).toBeGreaterThanOrEqual(
        0,
      );
      expect(data.data?.topicCoherence.redundancyScore).toBeLessThanOrEqual(1);
    });

    it("should provide recommendation based on conflicts", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          recommendation: string;
        };
      };

      expect(data.data?.recommendation).toBeDefined();
      expect(typeof data.data?.recommendation).toBe("string");
      expect(data.data?.recommendation.length).toBeGreaterThan(0);
    });

    it("should support filtering by clusterIds query parameter", async () => {
      const clusterIds = `${cluster1Id},${cluster2Id}`;
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report?clusterIds=${encodeURIComponent(clusterIds)}`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          clustersAnalyzed: number;
        };
      };

      expect(response.status).toBe(200);
      expect(data.data?.clustersAnalyzed).toBeLessThanOrEqual(2);
    });

    it("should support language parameter", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report?language=en`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          language: string;
        };
      };

      expect(data.data?.language).toBe("en");
    });

    it("should require authentication", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
      );

      const response = await router.request(request);
      expect(response.status).toBe(401);
    });

    it("should include analysis timestamp", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          analysisTime: string;
        };
      };

      expect(data.data?.analysisTime).toBeDefined();
      // Should be valid ISO string
      expect(new Date(data.data?.analysisTime || "").getTime()).toBeGreaterThan(
        0,
      );
    });

    it("should report conflicting clusters with overlap keywords", async () => {
      const request = new Request(
        `http://localhost/projects/${testProjectId}/conflict-report`,
        {
          headers: {
            "x-user-id": testUserId,
          },
        },
      );

      const response = await router.request(request);
      const data = (await response.json()) as {
        data?: {
          conflicts: {
            details: Array<{
              cluster1Id: string;
              cluster2Id: string;
              overlapKeywords: string[];
              jaccardSimilarity: number;
              severity: string;
            }>;
          };
        };
      };

      if (
        data.data?.conflicts.details.length &&
        data.data.conflicts.details.length > 0
      ) {
        const conflict = data.data.conflicts.details[0];
        expect(conflict.cluster1Id).toBeDefined();
        expect(conflict.cluster2Id).toBeDefined();
        expect(Array.isArray(conflict.overlapKeywords)).toBe(true);
        expect(typeof conflict.jaccardSimilarity).toBe("number");
        expect(["high", "medium", "low"]).toContain(conflict.severity);
      }
    });
  });
});
