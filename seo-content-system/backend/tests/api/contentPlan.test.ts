/**
 * Content Plan API Tests
 * Phase 5: Persistence and generation endpoints
 */

import { Hono } from "hono";
import { db } from "../../src/db";
import {
  keywordClusters,
  keywordJobs,
  projects,
  users,
  contentPlans,
} from "../../src/db/schema";
import router from "../../src/api/clusters";

describe("Content Plan API", () => {
  const app = new Hono().route("/api/clusters", router);

  let testUserId: string;
  let testProjectId: string;
  let testJobId: string;
  let testClusterId: string;

  beforeEach(async () => {
    // Clean up
    await db.delete(contentPlans).run();
    await db.delete(keywordClusters).run();
    await db.delete(keywordJobs).run();
    await db.delete(projects).run();
    await db.delete(users).run();

    // Create test data
    testUserId = `user-${Date.now()}`;
    testProjectId = `proj-${Date.now()}`;
    testJobId = `job-${Date.now()}`;
    testClusterId = `cluster-${Date.now()}`;

    await db.insert(users).values({
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      hashedPassword: "hashed",
      role: "user",
    });

    await db.insert(projects).values({
      id: testProjectId,
      ownerId: testUserId,
      name: "Test Project",
      siteName: "test.com",
      locale: "en",
      language: "en",
    });

    await db.insert(keywordJobs).values({
      id: testJobId,
      projectId: testProjectId,
      seedKeywords: JSON.stringify(["test"]),
      status: "completed",
      expansionConfigSnapshot: JSON.stringify({}),
    });

    await db.insert(keywordClusters).values({
      id: testClusterId,
      jobId: testJobId,
      pillarKeyword: "test",
      clusterName: "Test Cluster",
      pageType: "pillar",
      keywordsCount: 10,
      priorityScore: 50,
    });
  });

  describe("GET /api/clusters/:id/content-plan", () => {
    test("should return pending status for new cluster", async () => {
      const res = await app.request(
        `/api/clusters/${testClusterId}/content-plan`,
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("pending");
      expect(data.brief).toBeNull();
      expect(data.generatedAt).toBeNull();
    });

    test("should return saved plan after generation", async () => {
      const plan = {
        status: "completed" as const,
        briefJson: JSON.stringify({ title: "Test" }),
        faqJson: JSON.stringify({ faqs: [] }),
        linksJson: JSON.stringify({ outgoingLinks: [] }),
        modelVersion: "claude-3-5-sonnet-20241022",
        generatedAt: Math.floor(Date.now() / 1000),
        clusterId: testClusterId,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      await db.insert(contentPlans).values({
        id: `plan-${testClusterId}`,
        ...plan,
      });

      const res = await app.request(
        `/api/clusters/${testClusterId}/content-plan`,
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("completed");
      expect(data.brief).toEqual({ title: "Test" });
      expect(data.generatedAt).toBeDefined();
    });
  });

  describe("POST /api/clusters/:id/generate-content", () => {
    test("should return 404 for non-existent cluster", async () => {
      const res = await app.request(
        `/api/clusters/nonexistent/generate-content`,
        {
          method: "POST",
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/clusters/:id/content-plan", () => {
    test("should update brief and return 200 with updated plan", async () => {
      // Create a plan first
      const plan = {
        status: "completed" as const,
        briefJson: JSON.stringify({ title: "Original Title" }),
        faqJson: null,
        linksJson: null,
        modelVersion: "claude-3-5-sonnet-20241022",
        generatedAt: Math.floor(Date.now() / 1000),
        clusterId: testClusterId,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      await db.insert(contentPlans).values({
        id: `plan-${testClusterId}`,
        ...plan,
      });

      // Update with user edits
      const res = await app.request(
        `/api/clusters/${testClusterId}/content-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: { title: "Updated Title by User" },
          }),
        },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.brief).toEqual({ title: "Updated Title by User" });
      expect(data.isUserEdited).toBe(true);
      expect(data.editedAt).toBeDefined();
    });

    test("should return 409 when trying to update generating plan", async () => {
      // Create a plan in generating status
      const plan = {
        status: "generating" as const,
        briefJson: null,
        faqJson: null,
        linksJson: null,
        clusterId: testClusterId,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      await db.insert(contentPlans).values({
        id: `plan-${testClusterId}`,
        ...plan,
      });

      // Try to update
      const res = await app.request(
        `/api/clusters/${testClusterId}/content-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "test" }),
        },
      );

      expect(res.status).toBe(409);
    });

    test("should set publishing fields (publishedUrl, publishedAt)", async () => {
      // Create a plan
      const plan = {
        status: "completed" as const,
        briefJson: JSON.stringify({ title: "Test" }),
        faqJson: null,
        linksJson: null,
        modelVersion: "claude-3-5-sonnet-20241022",
        generatedAt: Math.floor(Date.now() / 1000),
        clusterId: testClusterId,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      await db.insert(contentPlans).values({
        id: `plan-${testClusterId}`,
        ...plan,
      });

      // Update with publishing info
      const publishedAt = Math.floor(Date.now() / 1000);
      const res = await app.request(
        `/api/clusters/${testClusterId}/content-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publishedUrl: "https://example.com/article",
            publishedAt,
            notes: "Published with minor edits",
          }),
        },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.publishedUrl).toBe("https://example.com/article");
      expect(data.publishedAt).toBe(publishedAt);
      expect(data.notes).toBe("Published with minor edits");
    });
  });
});
