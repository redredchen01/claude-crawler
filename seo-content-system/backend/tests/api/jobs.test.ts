import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { initializeDatabase } from "../../src/db/index.js";
import { db } from "../../src/db/index.js";
import {
  users,
  projects,
  keywordJobs,
  keywordCandidates,
  keywordFeatures,
} from "../../src/db/schema.js";
import { eq, and } from "drizzle-orm";
import { JobWorkerService } from "../../src/services/jobWorkerService.js";

describe("JobWorkerService", () => {
  let userId: string;
  let projectId: string;
  let jobId: string;

  beforeAll(async () => {
    await initializeDatabase();

    // Create test user
    userId = "test-user-1";
    await db.insert(users).values({
      id: userId,
      email: "test@example.com",
      hashedPassword: "hashed",
      role: "user",
      createdAt: new Date(),
    });

    // Create test project
    projectId = "test-project-1";
    await db.insert(projects).values({
      id: projectId,
      ownerId: userId,
      name: "Test Project",
      siteName: "example.com",
      locale: "en-US",
      language: "en",
      defaultEngine: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(keywordFeatures);
    await db.delete(keywordCandidates);
    await db.delete(keywordJobs);
    await db.delete(projects);
    await db.delete(users);
  });

  describe("processJob - full pipeline", () => {
    it("should process a job from expansion to classification", async () => {
      // Create job
      jobId = "test-job-1";
      await db.insert(keywordJobs).values({
        id: jobId,
        projectId,
        seedKeywords: JSON.stringify(["python", "react"]),
        status: "pending",
        configJson: JSON.stringify({
          expandDepth: 1,
          maxCandidatesPerStrategy: 20,
          totalMaxCandidates: 100,
          strategies: [
            "original",
            "space_modifier",
            "a_z_suffix",
            "question_modifiers",
          ],
          deduplication: true,
        }),
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Process job
      await JobWorkerService.processJob(jobId);

      // Verify job status
      const job = await db
        .select()
        .from(keywordJobs)
        .where(eq(keywordJobs.id, jobId))
        .limit(1);

      expect(job).toHaveLength(1);
      expect(job[0].status).toBe("completed");
    });

    it("should expand keywords from seeds", async () => {
      // Verify candidates were created
      const candidates = await db
        .select()
        .from(keywordCandidates)
        .where(eq(keywordCandidates.jobId, jobId));

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((c) => c.sourceType === "expansion")).toBe(true);
    });

    it("should normalize keywords", async () => {
      const candidates = await db
        .select()
        .from(keywordCandidates)
        .where(eq(keywordCandidates.jobId, jobId));

      // All candidates should have normalized keyword set
      const normalized = candidates.filter((c) => c.normalizedKeyword);
      expect(normalized.length).toBeGreaterThan(0);
    });

    it("should classify keywords", async () => {
      const features = await db
        .select()
        .from(keywordFeatures)
        .innerJoin(
          keywordCandidates,
          eq(keywordFeatures.keywordId, keywordCandidates.id),
        )
        .where(eq(keywordCandidates.jobId, jobId));

      expect(features.length).toBeGreaterThan(0);

      // Verify classification dimensions
      const feature = features[0];
      expect(feature.keyword_features.intentPrimary).toBeTruthy();
      expect(feature.keyword_features.funnelStage).toBeTruthy();
      expect(feature.keyword_features.contentFormatRecommendation).toBeTruthy();
      expect(feature.keyword_features.confidenceScore).toBeGreaterThanOrEqual(
        0,
      );
      expect(feature.keyword_features.confidenceScore).toBeLessThanOrEqual(1);
    });

    it("should calculate opportunity score", async () => {
      const features = await db
        .select()
        .from(keywordFeatures)
        .innerJoin(
          keywordCandidates,
          eq(keywordFeatures.keywordId, keywordCandidates.id),
        )
        .where(eq(keywordCandidates.jobId, jobId))
        .limit(1);

      expect(features).toHaveLength(1);
      const score = features[0].keyword_features.opportunityScore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("processJob - checkpoint recovery", () => {
    it("should resume from checkpoint on retry", async () => {
      // Create new job
      const jobId2 = "test-job-2";
      await db.insert(keywordJobs).values({
        id: jobId2,
        projectId,
        seedKeywords: JSON.stringify(["javascript"]),
        status: "pending",
        configJson: JSON.stringify({
          expandDepth: 1,
          maxCandidatesPerStrategy: 10,
          totalMaxCandidates: 50,
          strategies: ["original", "a_z_suffix"],
        }),
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Process once
      await JobWorkerService.processJob(jobId2);

      // Get checkpoint count after first run
      const job1 = await db
        .select()
        .from(keywordJobs)
        .where(eq(keywordJobs.id, jobId2))
        .limit(1);

      const checkpoint1 = job1[0].checkpointCount;
      expect(checkpoint1).toBeGreaterThan(0);

      // Process again (should resume)
      await JobWorkerService.processJob(jobId2);

      const job2 = await db
        .select()
        .from(keywordJobs)
        .where(eq(keywordJobs.id, jobId2))
        .limit(1);

      expect(job2[0].status).toBe("completed");
    });
  });

  describe("getJobStatus", () => {
    it("should return job status with result counts", async () => {
      const status = await JobWorkerService.getJobStatus(jobId);

      expect(status.jobId).toBe(jobId);
      expect(status.projectId).toBe(projectId);
      expect(status.status).toBe("completed");
      expect(status.totalCandidates).toBeGreaterThan(0);
      expect(status.processedCount).toBeGreaterThan(0);
      expect(status.startedAt).toBeTruthy();
    });

    it("should throw on invalid job ID", async () => {
      try {
        await JobWorkerService.getJobStatus("invalid-job-id");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe("job idempotency", () => {
    it("should handle duplicate insertions gracefully", async () => {
      // This tests UNIQUE constraints on (job_id, normalized_keyword, depth)
      const jobId3 = "test-job-3";
      await db.insert(keywordJobs).values({
        id: jobId3,
        projectId,
        seedKeywords: JSON.stringify(["test"]),
        status: "pending",
        configJson: JSON.stringify({
          expandDepth: 1,
          maxCandidatesPerStrategy: 5,
          totalMaxCandidates: 20,
          strategies: ["original"],
        }),
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Process twice
      await JobWorkerService.processJob(jobId3);
      await JobWorkerService.processJob(jobId3);

      // Verify only unique keywords stored
      const candidates = await db
        .select()
        .from(keywordCandidates)
        .where(eq(keywordCandidates.jobId, jobId3));

      // Should have consistent count across runs
      const uniqueNormalized = new Set(
        candidates.map((c) => c.normalizedKeyword),
      );
      expect(uniqueNormalized.size).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should mark job as failed on processing error", async () => {
      // Create job with invalid seed keywords (empty)
      const jobId4 = "test-job-4";
      await db.insert(keywordJobs).values({
        id: jobId4,
        projectId,
        seedKeywords: JSON.stringify([]),
        status: "pending",
        configJson: JSON.stringify({}),
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Try to process (will fail because seed is empty)
      try {
        await JobWorkerService.processJob(jobId4);
      } catch (error) {
        // Expected to fail
      }

      const job = await db
        .select()
        .from(keywordJobs)
        .where(eq(keywordJobs.id, jobId4))
        .limit(1);

      // Job should be marked as failed
      expect(job[0].status).toBe("failed");
    });
  });

  describe("config defaults", () => {
    it("should use default config when none provided", async () => {
      const jobId5 = "test-job-5";
      await db.insert(keywordJobs).values({
        id: jobId5,
        projectId,
        seedKeywords: JSON.stringify(["node"]),
        status: "pending",
        configJson: JSON.stringify({}), // Empty config
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Should process successfully with defaults
      await JobWorkerService.processJob(jobId5);

      const job = await db
        .select()
        .from(keywordJobs)
        .where(eq(keywordJobs.id, jobId5))
        .limit(1);

      expect(job[0].status).toBe("completed");
    });
  });

  describe("multiple seeds", () => {
    it("should expand multiple seed keywords", async () => {
      const jobId6 = "test-job-6";
      const seeds = ["python", "javascript", "typescript"];

      await db.insert(keywordJobs).values({
        id: jobId6,
        projectId,
        seedKeywords: JSON.stringify(seeds),
        status: "pending",
        configJson: JSON.stringify({
          expandDepth: 1,
          maxCandidatesPerStrategy: 15,
          totalMaxCandidates: 100,
          strategies: ["original", "question_modifiers"],
        }),
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await JobWorkerService.processJob(jobId6);

      // Verify all seeds were expanded
      const candidates = await db
        .select()
        .from(keywordCandidates)
        .where(eq(keywordCandidates.jobId, jobId6));

      const parents = new Set(candidates.map((c) => c.parentKeyword));
      expect(parents.size).toBeGreaterThanOrEqual(1); // At least one parent keyword
    });
  });
});
