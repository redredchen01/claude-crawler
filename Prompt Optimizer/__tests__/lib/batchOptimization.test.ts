import { prisma } from "@/lib/db";
import {
  createBatchJob,
  getBatchJob,
  updateBatchProgress,
  storeBatchResults,
  listBatchJobs,
  cancelBatchJob,
  getBatchPrompts,
  getBatchResults,
  BatchStatus,
} from "@/lib/batchOptimization";

describe("Batch Optimization Service", () => {
  let testUserId: string;
  let testTeamId: string;
  let jobId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `batch-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: `Batch Test Team ${Date.now()}`,
        slug: `batch-test-${Date.now()}`,
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

  describe("createBatchJob", () => {
    test("should create batch job with valid prompts", async () => {
      const prompts = [
        "Write a Python function to calculate factorial",
        "Explain the concept of recursion",
      ];

      const job = await createBatchJob(
        testUserId,
        testTeamId,
        prompts,
        "Test Batch",
      );

      expect(job.id).toBeDefined();
      expect(job.userId).toBe(testUserId);
      expect(job.teamId).toBe(testTeamId);
      expect(job.status).toBe(BatchStatus.PENDING);
      expect(job.totalItems).toBe(2);
      expect(job.processedItems).toBe(0);
      expect(job.failedItems).toBe(0);
      expect(job.createdAt).toBeDefined();

      jobId = job.id;
    });

    test("should reject empty prompts array", async () => {
      await expect(
        createBatchJob(testUserId, testTeamId, [], "Empty"),
      ).rejects.toThrow("At least one prompt is required");
    });

    test("should reject more than 1000 prompts", async () => {
      const prompts = Array(1001).fill("test prompt");

      await expect(
        createBatchJob(testUserId, testTeamId, prompts, "Too many"),
      ).rejects.toThrow("Batch size cannot exceed 1000 prompts");
    });

    test("should reject prompts shorter than 10 characters", async () => {
      const prompts = ["short"];

      await expect(
        createBatchJob(testUserId, testTeamId, prompts, "Short"),
      ).rejects.toThrow("must be between 10 and 50000 characters");
    });

    test("should reject prompts longer than 50000 characters", async () => {
      const prompts = ["a".repeat(50001)];

      await expect(
        createBatchJob(testUserId, testTeamId, prompts, "Long"),
      ).rejects.toThrow("must be between 10 and 50000 characters");
    });

    test("should accept prompts between 10 and 50000 characters", async () => {
      const prompts = ["a".repeat(50000), "b".repeat(10)];

      const job = await createBatchJob(
        testUserId,
        testTeamId,
        prompts,
        "Boundary test",
      );

      expect(job.totalItems).toBe(2);
    });
  });

  describe("getBatchJob", () => {
    test("should retrieve batch job by ID", async () => {
      const job = await getBatchJob(jobId, testUserId);

      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
      expect(job?.userId).toBe(testUserId);
    });

    test("should return null for non-existent job", async () => {
      const job = await getBatchJob("non-existent", testUserId);

      expect(job).toBeNull();
    });

    test("should deny access for non-owner", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `other-user-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const job = await getBatchJob(jobId, otherUser.id);

      expect(job).toBeNull();

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe("updateBatchProgress", () => {
    test("should update batch progress and status", async () => {
      await updateBatchProgress(jobId, 1, 0, BatchStatus.PROCESSING);

      const job = await getBatchJob(jobId, testUserId);

      expect(job?.processedItems).toBe(1);
      expect(job?.failedItems).toBe(0);
      expect(job?.status).toBe(BatchStatus.PROCESSING);
      expect(job?.startedAt).toBeDefined();
    });

    test("should set completedAt when status is COMPLETED", async () => {
      await updateBatchProgress(jobId, 2, 0, BatchStatus.COMPLETED);

      const job = await getBatchJob(jobId, testUserId);

      expect(job?.status).toBe(BatchStatus.COMPLETED);
      expect(job?.completedAt).toBeDefined();
    });
  });

  describe("storeBatchResults", () => {
    test("should store batch results with URL", async () => {
      const results = [
        { prompt: "test", optimized: "test optimized" },
        { prompt: "test2", optimized: "test2 optimized" },
      ];
      const resultsUrl = "https://example.com/results/123";

      await storeBatchResults(jobId, results, resultsUrl);

      const job = await getBatchJob(jobId, testUserId);

      expect(job?.resultsUrl).toBe(resultsUrl);
    });
  });

  describe("getBatchPrompts", () => {
    test("should retrieve original prompts", async () => {
      const prompts = await getBatchPrompts(jobId, testUserId);

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts?.length).toBe(2);
    });

    test("should return null for non-existent job", async () => {
      const prompts = await getBatchPrompts("non-existent", testUserId);

      expect(prompts).toBeNull();
    });

    test("should deny access for non-owner", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `other-prompts-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const prompts = await getBatchPrompts(jobId, otherUser.id);

      expect(prompts).toBeNull();

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe("getBatchResults", () => {
    test("should retrieve batch results", async () => {
      const results = await getBatchResults(jobId, testUserId);

      expect(Array.isArray(results)).toBe(true);
      expect(results?.length).toBe(2);
    });

    test("should return null if results not stored", async () => {
      const job = await createBatchJob(
        testUserId,
        testTeamId,
        ["Write a test prompt for batch operations"],
        "No results yet",
      );

      const results = await getBatchResults(job.id, testUserId);

      expect(results).toBeNull();
    });

    test("should deny access for non-owner", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `other-results-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const results = await getBatchResults(jobId, otherUser.id);

      expect(results).toBeNull();

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe("listBatchJobs", () => {
    test("should list user batch jobs with pagination", async () => {
      const result = await listBatchJobs(testUserId, undefined, 50, 0);

      expect(Array.isArray(result.jobs)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    test("should filter by teamId", async () => {
      const result = await listBatchJobs(testUserId, testTeamId, 50, 0);

      expect(result.jobs.every((j) => j.teamId === testTeamId)).toBe(true);
    });

    test("should support pagination", async () => {
      const page1 = await listBatchJobs(testUserId, undefined, 1, 0);
      const page2 = await listBatchJobs(testUserId, undefined, 1, 1);

      expect(page1.offset).toBe(0);
      expect(page2.offset).toBe(1);
    });
  });

  describe("cancelBatchJob", () => {
    test("should cancel pending batch job", async () => {
      const job = await createBatchJob(
        testUserId,
        testTeamId,
        ["Prompt to cancel"],
        "Cancel test",
      );

      await cancelBatchJob(job.id, testUserId);

      const cancelled = await getBatchJob(job.id, testUserId);

      expect(cancelled?.status).toBe(BatchStatus.CANCELLED);
      expect(cancelled?.completedAt).toBeDefined();
    });

    test("should deny access for non-owner", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `other-cancel-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      await expect(cancelBatchJob(jobId, otherUser.id)).rejects.toThrow(
        "access denied",
      );

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    test("should reject cancelling completed job", async () => {
      const job = await createBatchJob(
        testUserId,
        testTeamId,
        ["Completed prompt"],
        "Completed test",
      );

      await updateBatchProgress(job.id, 1, 0, BatchStatus.COMPLETED);

      await expect(cancelBatchJob(job.id, testUserId)).rejects.toThrow(
        "Cannot cancel a completed batch job",
      );
    });
  });
});
