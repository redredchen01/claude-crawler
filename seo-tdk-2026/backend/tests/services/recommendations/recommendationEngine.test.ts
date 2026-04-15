/**
 * Recommendation Engine Tests
 */

import { db, initializeDatabase } from "../../../src/db/index.js";
import { contentPlans } from "../../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { RecommendationEngine } from "../../../src/services/recommendations/recommendationEngine.js";

describe("P4.3: Recommendation Engine", () => {
  const testProjectId = "rec-test-project";
  const testUserId = "test-user-rec";

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    // Clean up test data
    await db
      .delete(contentPlans)
      .where(eq(contentPlans.projectId, testProjectId));
  });

  describe("getMergeRecommendations", () => {
    it("should return no recommendations for empty project", async () => {
      const recs = await RecommendationEngine.getMergeRecommendations(
        testProjectId,
      );
      expect(recs).toEqual([]);
    });

    it("should detect merge opportunities (Jaccard > 0.8)", async () => {
      // Create 2 clusters with identical keywords (Jaccard = 1.0 > 0.8)
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Python Tutorial",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial", "programming"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Python Guide",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial", "programming"],
          }),
          tdkGenerationCount: 1,
        },
      ]);

      const recs =
        await RecommendationEngine.getMergeRecommendations(testProjectId);

      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].type).toBe("merge");
      expect(recs[0].priority).toBe("high");
    });
  });

  describe("getDifferentiateRecommendations", () => {
    it("should detect differentiation opportunities (Jaccard 0.4-0.8)", async () => {
      // Create 2 clusters with moderate overlap (2 shared: python + tutorial, out of 5 total = 0.4)
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Python Advanced",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial", "advanced", "async"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Python Basics",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial", "beginner"],
          }),
          tdkGenerationCount: 1,
        },
      ]);

      const recs =
        await RecommendationEngine.getDifferentiateRecommendations(
          testProjectId,
        );

      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].type).toBe("differentiate");
    });
  });

  describe("getKeywordOpportunities", () => {
    it("should identify high-value keywords", async () => {
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Python Guide",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial", "beginner"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Python Advanced",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "advanced", "expert"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-3",
          projectId: testProjectId,
          clusterId: "cluster-3",
          title: "JavaScript Guide",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["javascript", "tutorial", "web"],
          }),
          tdkGenerationCount: 1,
        },
      ]);

      const recs =
        await RecommendationEngine.getKeywordOpportunities(testProjectId);

      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].type).toBe("high-value-keyword");
    });
  });

  describe("getProjectRecommendations", () => {
    it("should combine all recommendation types", async () => {
      await db.insert(contentPlans).values([
        {
          id: "cluster-1",
          projectId: testProjectId,
          clusterId: "cluster-1",
          title: "Python Basics",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-2",
          projectId: testProjectId,
          clusterId: "cluster-2",
          title: "Python Guide",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["python", "tutorial"],
          }),
          tdkGenerationCount: 1,
        },
        {
          id: "cluster-3",
          projectId: testProjectId,
          clusterId: "cluster-3",
          title: "JavaScript Tutorial",
          contentType: "blog",
          createdBy: testUserId,
          tdkJson: JSON.stringify({
            keywords: ["javascript", "web"],
          }),
          tdkGenerationCount: 1,
        },
      ]);

      const recs =
        await RecommendationEngine.getProjectRecommendations(testProjectId);

      expect(recs.length).toBeGreaterThan(0);
    });

    it("should return empty list for project with no TDK", async () => {
      const recs =
        await RecommendationEngine.getProjectRecommendations(testProjectId);

      expect(recs).toEqual([]);
    });
  });
});
