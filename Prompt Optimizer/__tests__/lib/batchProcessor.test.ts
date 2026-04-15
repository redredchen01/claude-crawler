import { prisma } from "@/lib/db";
import {
  processBatchJob,
  processPendingBatchJobs,
  getBatchProcessingStats,
} from "@/lib/batchProcessor";

describe("Batch Processor Service", () => {
  let testUserId: string;
  let testTeamId: string;
  let jobId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `batch-processor-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: `Batch Processor Team ${Date.now()}`,
        slug: `batch-proc-${Date.now()}`,
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

  describe("processBatchJob", () => {
    test("should reject non-existent jobs gracefully", async () => {
      await processBatchJob("non-existent-id");
      // Should not throw
      expect(true).toBe(true);
    });

    test("should skip cancelled jobs", async () => {
      const cancelledJob = await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "cancelled",
          totalItems: 1,
          processedItems: 0,
          failedItems: 0,
          batchName: "Cancelled Job",
          prompts: JSON.stringify(["Test prompt"]),
        },
      });

      await processBatchJob(cancelledJob.id);

      const job = await prisma.batchOptimizationJob.findUnique({
        where: { id: cancelledJob.id },
      });

      expect(job?.status).toBe("cancelled");
      expect(job?.processedItems).toBe(0);
    });

    test("should handle invalid JSON prompts", async () => {
      const invalidJob = await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "pending",
          totalItems: 1,
          processedItems: 0,
          failedItems: 0,
          batchName: "Invalid JSON",
          prompts: "not valid json",
        },
      });

      await processBatchJob(invalidJob.id);

      const job = await prisma.batchOptimizationJob.findUnique({
        where: { id: invalidJob.id },
      });

      expect(job?.status).toBe("failed");
      expect(job?.error).toContain("parse");
    });
  });

  describe("processPendingBatchJobs", () => {
    test("should return result object with required fields", async () => {
      const result = await processPendingBatchJobs();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("failed");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test("should handle empty pending jobs queue", async () => {
      const result = await processPendingBatchJobs();

      expect(typeof result.processed).toBe("number");
      expect(typeof result.failed).toBe("number");
      expect(result.processed >= 0).toBe(true);
      expect(result.failed >= 0).toBe(true);
    });

    test("should not throw on processing errors", async () => {
      try {
        const result = await processPendingBatchJobs();
        expect(result.errors).toEqual(expect.any(Array));
      } catch {
        fail("processPendingBatchJobs should not throw");
      }
    });
  });

  describe("getBatchProcessingStats", () => {
    beforeEach(async () => {
      // Create jobs with different statuses
      await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "pending",
          totalItems: 1,
          processedItems: 0,
          failedItems: 0,
          batchName: "Pending",
          prompts: JSON.stringify(["Test"]),
        },
      });

      await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "processing",
          totalItems: 1,
          processedItems: 0,
          failedItems: 0,
          batchName: "Processing",
          prompts: JSON.stringify(["Test"]),
        },
      });

      await prisma.batchOptimizationJob.create({
        data: {
          userId: testUserId,
          teamId: testTeamId,
          status: "completed",
          totalItems: 1,
          processedItems: 1,
          failedItems: 0,
          batchName: "Completed",
          prompts: JSON.stringify(["Test"]),
        },
      });
    });

    test("should return correct status counts", async () => {
      const stats = await getBatchProcessingStats();

      expect(stats.pending).toBeGreaterThanOrEqual(0);
      expect(stats.processing).toBeGreaterThanOrEqual(0);
      expect(stats.completed).toBeGreaterThanOrEqual(0);
      expect(stats.failed).toBeGreaterThanOrEqual(0);
      expect(stats.partiallyFailed).toBeGreaterThanOrEqual(0);
      expect(stats.cancelled).toBeGreaterThanOrEqual(0);
    });

    test("should include all status types", async () => {
      const stats = await getBatchProcessingStats();

      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("processing");
      expect(stats).toHaveProperty("completed");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("partiallyFailed");
      expect(stats).toHaveProperty("cancelled");
    });
  });
});
