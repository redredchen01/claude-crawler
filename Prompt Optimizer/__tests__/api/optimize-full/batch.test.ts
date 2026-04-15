import { POST } from "@/app/api/optimize-full/batch/route";
import { NextRequest } from "next/server";
import * as optimization from "@/lib/services/optimization";
import { prisma } from "@/lib/db";
import * as rbac from "@/lib/rbac";
import * as rateLimit from "@/lib/rateLimit";

jest.mock("@/lib/services/optimization");
jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      createMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
}));
jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
}));

const mockOptimization = optimization as jest.Mocked<typeof optimization>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRbac = rbac as jest.Mocked<typeof rbac>;
const mockRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;

beforeEach(() => {
  jest.clearAllMocks();
  // Default mock for requireAuth
  mockRbac.requireAuth.mockResolvedValue({
    user: {
      id: "test-user-123",
      email: "test@example.com",
      role: "USER",
    },
  } as any);
  // Default mock for rate limit
  mockRateLimit.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 10,
    limit: 10,
    resetAt: new Date(Date.now() + 60 * 60 * 1000),
  });
});

function createRequest(body: any): NextRequest {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => (key === "x-request-id" ? "test-request-id" : null),
    },
  } as any;
}

describe("POST /api/optimize-full/batch", () => {
  const mockResult = {
    optimized_prompt: "Optimized prompt",
    explanation: "Added details",
    raw_score: {
      total: 45,
      dimensions: {
        specificity: 10,
        context: 8,
        output_spec: 12,
        runnability: 8,
        evaluation: 5,
        safety: 2,
      },
      missing_slots: [],
      issues: "None",
      diagnostics: "Test",
    },
    optimized_score: {
      total: 70,
      dimensions: {
        specificity: 15,
        context: 12,
        output_spec: 18,
        runnability: 12,
        evaluation: 8,
        safety: 5,
      },
      missing_slots: [],
      issues: "None",
      diagnostics: "Test",
    },
    score_delta: {
      total_delta: 25,
      dimension_deltas: {
        specificity: 5,
        context: 4,
        output_spec: 6,
        runnability: 4,
        evaluation: 3,
        safety: 3,
      },
    },
  };

  it("should process multiple prompts successfully", async () => {
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);

    const request = createRequest({
      prompts: ["Prompt 1", "Prompt 2", "Prompt 3"],
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.batch_size).toBe(3);
    expect(data.summary.successful).toBe(3);
    expect(data.summary.failed).toBe(0);
    expect(data.results).toHaveLength(3);
    expect(data.results[0].success).toBe(true);
  });

  it("should return 400 when prompts is not an array", async () => {
    const request = createRequest({
      prompts: "not an array",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("prompts must be an array");
  });

  it("should return 400 when prompts array is empty", async () => {
    const request = createRequest({
      prompts: [],
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("cannot be empty");
  });

  it("should return 400 when batch size exceeds limit", async () => {
    const prompts = Array(11).fill("Prompt");
    const request = createRequest({ prompts });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("exceeds maximum size");
  });

  it("should return 400 when a prompt is not a string", async () => {
    const request = createRequest({
      prompts: ["Valid prompt", 123, "Another valid"],
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("prompts[1]");
  });

  it("should return 400 when a prompt exceeds max length", async () => {
    const longPrompt = "a".repeat(50001);
    const request = createRequest({
      prompts: ["Valid", longPrompt],
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("exceeds maximum length");
  });

  it("should return 429 when rate limit insufficient", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 2, // Only 2 remaining
      limit: 10,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = createRequest({
      prompts: ["Prompt 1", "Prompt 2", "Prompt 3"], // Need 3
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Insufficient rate limit quota");
  });

  it("should add rate limit headers to response", async () => {
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);

    const request = createRequest({
      prompts: ["Prompt 1"],
    });

    const response = await POST(request);

    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("should save successful results to database", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);

    const request = createRequest({
      prompts: ["Prompt 1", "Prompt 2"],
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.optimizationRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          raw_prompt: "Prompt 1",
          userId: "test-user-123",
        }),
        expect.objectContaining({
          raw_prompt: "Prompt 2",
          userId: "test-user-123",
        }),
      ]),
    });
  });

  it("should handle partial failures", async () => {
    const error = new Error("Service unavailable");
    mockOptimization.optimizeAndScoreService
      .mockResolvedValueOnce(mockResult)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(mockResult);

    const request = createRequest({
      prompts: ["Prompt 1", "Prompt 2 (fails)", "Prompt 3"],
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary.successful).toBe(2);
    expect(data.summary.failed).toBe(1);
    expect(data.results[1].success).toBe(false);
    expect(data.results[1].error).toBe("Service unavailable");
  });

  it("should handle empty prompt string", async () => {
    const request = createRequest({
      prompts: ["Valid", "   ", "Valid"],
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("must be a non-empty string");
  });

  it("should return 401 for unauthorized access", async () => {
    mockRbac.requireAuth.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { name: "UnauthorizedError" }),
    );

    const request = createRequest({
      prompts: ["Prompt 1"],
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
