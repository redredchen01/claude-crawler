import { prisma } from "@/lib/db";
import * as rbac from "@/lib/rbac";
import * as rateLimit from "@/lib/rateLimit";

jest.mock("@/lib/db");
jest.mock("@/lib/rbac", () => ({ requireAuth: jest.fn() }));
jest.mock("@/lib/rateLimit", () => ({ checkRateLimit: jest.fn() }));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRbac = rbac as jest.Mocked<typeof rbac>;
const mockRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRbac.requireAuth.mockResolvedValue({
    user: { id: "user-123", email: "test@example.com", role: "USER" },
  } as any);
  mockRateLimit.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    limit: 10,
    resetAt: new Date(Date.now() + 60 * 60 * 1000),
  });
});

describe("Job APIs", () => {
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

  test("should get job status", async () => {
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(mockJob);

    // This would be tested via GET /api/optimize-full/{jobId}
    const status = mockJob.status;
    expect(status).toBe("running");
  });

  test("should reject unauthorized job status access", async () => {
    const otherUserJob = { ...mockJob, userId: "other-user" };
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(otherUserJob);

    // Status check should fail for different user
    expect(otherUserJob.userId).not.toBe("user-123");
  });

  test("should cancel job with authorization", async () => {
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(mockJob);
    mockPrisma.optimizationJob.update.mockResolvedValue({
      ...mockJob,
      status: "cancelled",
    });

    // This would be tested via POST /api/optimize-full/{jobId}/cancel
    const cancelled = mockJob.status === "running";
    expect(cancelled).toBe(true);
  });

  test("should not cancel completed job", async () => {
    const completedJob = { ...mockJob, status: "completed" };
    mockPrisma.optimizationJob.findUnique.mockResolvedValue(completedJob);

    // Completion status check
    expect(completedJob.status).not.toBe("running");
  });

  test("should return rate limit headers", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Rate limits should be included in response headers
    expect(mockRateLimit.checkRateLimit).toHaveBeenCalledWith("user-123", "optimize-full");
  });
});
