jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import {
  createOptimizationJob,
  getJobStatus,
  cancelJob,
  isJobCancelled,
  completeJob,
  failJob,
} from "@/lib/jobs";

const { prisma: mockPrisma } = require("@/lib/db");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Job Service", () => {
  const mockJob = {
    id: "job-123",
    userId: "user-123",
    status: "running",
    result: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
  };

  test("should create optimization job", async () => {
    mockPrisma.optimizationJob.create.mockResolvedValue(mockJob);

    const jobId = await createOptimizationJob("user-123");

    expect(jobId).toBe("job-123");
    expect(mockPrisma.optimizationJob.create).toHaveBeenCalledWith({
      data: { userId: "user-123", status: "running" },
    });
  });

  test("should get job status", async () => {
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(mockJob);

    const status = await getJobStatus("job-123", "user-123");

    expect(status).toEqual(
      expect.objectContaining({
        id: "job-123",
        status: "running",
      }),
    );
  });

  test("should return null for unauthorized access", async () => {
    const otherUserJob = { ...mockJob, userId: "other-user" };
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(otherUserJob);

    const status = await getJobStatus("job-123", "user-123");

    expect(status).toBeNull();
  });

  test("should cancel job", async () => {
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(mockJob);
    mockPrisma.optimizationJob.update.mockResolvedValue({
      ...mockJob,
      status: "cancelled",
      cancelledAt: new Date(),
    });

    const success = await cancelJob("job-123", "user-123");

    expect(success).toBe(true);
    expect(mockPrisma.optimizationJob.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: {
        status: "cancelled",
        cancelledAt: expect.any(Date),
      },
    });
  });

  test("should check if job is cancelled", async () => {
    const cancelledJob = { ...mockJob, status: "cancelled" };
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(cancelledJob);

    const cancelled = await isJobCancelled("job-123");

    expect(cancelled).toBe(true);
  });

  test("should complete job", async () => {
    mockPrisma.optimizationJob.update.mockResolvedValue({
      ...mockJob,
      status: "completed",
      result: '{"optimized_prompt":"test"}',
    });

    await completeJob("job-123", { optimized_prompt: "test" });

    expect(mockPrisma.optimizationJob.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: {
        status: "completed",
        result: expect.any(String),
      },
    });
  });

  test("should fail job", async () => {
    mockPrisma.optimizationJob.update.mockResolvedValue({
      ...mockJob,
      status: "failed",
      error: "Test error",
    });

    await failJob("job-123", "Test error");

    expect(mockPrisma.optimizationJob.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: {
        status: "failed",
        error: "Test error",
      },
    });
  });
});
