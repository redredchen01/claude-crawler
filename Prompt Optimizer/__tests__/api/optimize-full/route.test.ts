jest.mock("@/lib/services/optimization");
jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    optimizationJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
}));
jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
}));

import { POST } from "@/app/api/optimize-full/route";
import { NextRequest } from "next/server";
import * as optimization from "@/lib/services/optimization";
import * as rbac from "@/lib/rbac";
import * as rateLimit from "@/lib/rateLimit";

const { prisma: mockPrisma } = require("@/lib/db");

const mockOptimization = optimization as jest.Mocked<typeof optimization>;
const mockRbac = rbac as jest.Mocked<typeof rbac>;
const mockRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;

beforeEach(() => {
  jest.clearAllMocks();
  // Default mock for requireAuth - returns a valid session
  mockRbac.requireAuth.mockResolvedValue({
    user: {
      id: "test-user-123",
      email: "test@example.com",
      role: "USER",
    },
  } as any);
  // Default mock for rate limit - always allow
  mockRateLimit.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    limit: 10,
    resetAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  // Default mock for job creation
  mockPrisma.optimizationJob.create.mockResolvedValue({
    id: "job-123",
    userId: "test-user-123",
    status: "running",
    result: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
  });
  // Default mock for job update
  mockPrisma.optimizationJob.update.mockResolvedValue({
    id: "job-123",
    userId: "test-user-123",
    status: "completed",
    result: '{"test": "result"}',
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
  });
});

// Helper to create mock request
function createRequest(body: any): NextRequest {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => (key === "x-request-id" ? "test-request-id" : null),
    },
  } as any;
}

describe("POST /api/optimize-full", () => {
  const mockResult = {
    optimized_prompt:
      "You are a Python developer. Write clean code to process CSV files.",
    explanation: "Added specificity (Python) and detailed requirements",
    raw_score: {
      total: 35,
      dimensions: {
        specificity: 5,
        context: 5,
        output_spec: 5,
        runnability: 5,
        evaluation: 5,
        safety: 5,
      },
      missing_slots: ["language", "format"],
      issues: "Lacks specificity",
      diagnostics: "Specify language and format",
    },
    optimized_score: {
      total: 82,
      dimensions: {
        specificity: 18,
        context: 16,
        output_spec: 18,
        runnability: 14,
        evaluation: 12,
        safety: 9,
      },
      missing_slots: [],
      issues: "None",
      diagnostics: "Excellent prompt",
    },
    score_delta: {
      total_delta: 47,
      dimension_deltas: {
        specificity: 13,
        context: 11,
        output_spec: 13,
        runnability: 9,
        evaluation: 7,
        safety: 4,
      },
    },
  };

  test("should optimize and save prompt successfully", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({
      id: "1",
      raw_prompt: "Write code",
      raw_score: mockResult.raw_score as any,
      optimized_prompt: mockResult.optimized_prompt,
      optimized_score: mockResult.optimized_score as any,
      optimization_explanation: mockResult.explanation,
      created_at: new Date(),
    } as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.optimized_prompt).toBe(mockResult.optimized_prompt);
    expect(data.score_delta.total_delta).toBe(47);
    expect(mockOptimization.optimizeAndScoreService).toHaveBeenCalledWith(
      "Write code",
    );
    expect(mockPrisma.optimizationRecord.create).toHaveBeenCalled();
  });

  test("should save all fields to database correctly", async () => {
    const request = createRequest({ raw_prompt: "Write code to process data" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.optimizationRecord.create).toHaveBeenCalledWith({
      data: {
        raw_prompt: "Write code to process data",
        raw_score: JSON.stringify(mockResult.raw_score),
        raw_score_total: mockResult.raw_score.total,
        optimized_prompt: mockResult.optimized_prompt,
        optimized_score: JSON.stringify(mockResult.optimized_score),
        optimized_score_total: mockResult.optimized_score.total,
        optimization_explanation: mockResult.explanation,
        userId: "test-user-123",
      },
    });
  });

  test("should return 400 when raw_prompt is missing", async () => {
    const request = createRequest({});

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing or invalid raw_prompt");
    expect(mockOptimization.optimizeAndScoreService).not.toHaveBeenCalled();
  });

  test("should return 400 when raw_prompt is not a string", async () => {
    const request = createRequest({ raw_prompt: 123 });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing or invalid raw_prompt");
  });

  test("should return 400 when raw_prompt is null", async () => {
    const request = createRequest({ raw_prompt: null });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test("should return 500 when optimization service fails", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    const error = new Error("LLM service unavailable");
    mockOptimization.optimizeAndScoreService.mockRejectedValue(error);

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("LLM service unavailable");
    expect(mockPrisma.optimizationRecord.create).not.toHaveBeenCalled();
  });

  test("should return 200 even when database save fails (graceful degradation)", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    const error = new Error("Database connection failed");
    mockPrisma.optimizationRecord.create.mockRejectedValue(error);

    const response = await POST(request);

    // Route should still return 200 with optimization result even if database save fails
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.optimized_prompt).toBe(mockResult.optimized_prompt);
  });

  test("should return complete optimization result", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("optimized_prompt");
    expect(data).toHaveProperty("explanation");
    expect(data).toHaveProperty("raw_score");
    expect(data).toHaveProperty("optimized_score");
    expect(data).toHaveProperty("score_delta");
  });

  test("should return scores with correct structure", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    const data = await response.json();
    expect(data.raw_score).toHaveProperty("total");
    expect(data.raw_score).toHaveProperty("dimensions");
    expect(data.optimized_score).toHaveProperty("total");
    expect(data.optimized_score).toHaveProperty("dimensions");
  });

  test("should handle prompts with special characters", async () => {
    const specialPrompt = 'Write code: "test" & <tag> 中文';
    const request = createRequest({ raw_prompt: specialPrompt });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockOptimization.optimizeAndScoreService).toHaveBeenCalledWith(
      specialPrompt,
    );
  });

  test("should handle multiline prompts", async () => {
    const multilinePrompt = "Write code\nto process\ndata";
    const request = createRequest({ raw_prompt: multilinePrompt });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockOptimization.optimizeAndScoreService).toHaveBeenCalledWith(
      multilinePrompt,
    );
  });

  test("should pass Content-Type header in response", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("should handle long prompts", async () => {
    const longPrompt = "Write code" + "a".repeat(1000);
    const request = createRequest({ raw_prompt: longPrompt });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockOptimization.optimizeAndScoreService).toHaveBeenCalledWith(
      longPrompt,
    );
  });

  test("should propagate generic error message when error has no message", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    const error = new Error();
    error.message = "";
    mockOptimization.optimizeAndScoreService.mockRejectedValue(error);

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("Failed to optimize prompt");
  });

  test("should return 429 when rate limit exceeded", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 10,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = createRequest({ raw_prompt: "Write code" });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Rate limit exceeded");
    expect(mockOptimization.optimizeAndScoreService).not.toHaveBeenCalled();
  });

  test("should include X-RateLimit headers in successful response", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockOptimization.optimizeAndScoreService.mockResolvedValue(mockResult);
    mockPrisma.optimizationRecord.create.mockResolvedValue({} as any);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).not.toBeNull();
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });

  test("should include X-RateLimit headers in 429 response", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 10,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = createRequest({ raw_prompt: "Write code" });
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });
});
