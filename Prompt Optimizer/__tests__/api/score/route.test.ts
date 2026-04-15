import { POST } from "@/app/api/score/route";
import { NextRequest } from "next/server";
import * as scoring from "@/lib/services/scoring";
import * as rbac from "@/lib/rbac";
import * as rateLimit from "@/lib/rateLimit";

jest.mock("@/lib/services/scoring");
jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
}));
jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
}));

const mockScoring = scoring as jest.Mocked<typeof scoring>;
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
    remaining: 29,
    limit: 30,
    resetAt: new Date(Date.now() + 60 * 60 * 1000),
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

describe("POST /api/score", () => {
  const mockScore = {
    total: 45,
    dimensions: {
      specificity: 10,
      context: 8,
      output_spec: 12,
      runnability: 8,
      evaluation: 5,
      safety: 2,
    },
    missing_slots: ["language", "format"],
    issues: "Missing implementation details",
    diagnostics: "Specify what programming language and output format",
  };

  test("should score a valid prompt successfully", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(mockScore);
    expect(mockScoring.scorePromptService).toHaveBeenCalledWith("Write code");
  });

  test("should return 400 when raw_prompt is missing", async () => {
    const request = createRequest({});

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing or invalid raw_prompt");
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
    const data = await response.json();
    expect(data.error).toContain("Missing or invalid raw_prompt");
  });

  test("should return 400 when raw_prompt exceeds 50000 characters", async () => {
    const longPrompt = "a".repeat(50001);
    const request = createRequest({ raw_prompt: longPrompt });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("exceeds maximum length");
    expect(mockScoring.scorePromptService).not.toHaveBeenCalled();
  });

  test("should return 500 when scoring service fails", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    const error = new Error("API rate limit exceeded");
    mockScoring.scorePromptService.mockRejectedValue(error);

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("API rate limit exceeded");
  });

  test("should return 500 with generic message on unknown error", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    const error = new Error("Unknown error");
    error.message = "";
    mockScoring.scorePromptService.mockRejectedValue(error);

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("Failed to score prompt");
  });

  test("should accept prompt at boundary length (50000 chars)", async () => {
    const boundaryPrompt = "a".repeat(50000);
    const request = createRequest({ raw_prompt: boundaryPrompt });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockScoring.scorePromptService).toHaveBeenCalledWith(boundaryPrompt);
  });

  test("should handle prompts with special characters", async () => {
    const specialPrompt = 'Write code: "test" & <tag> 中文';
    const request = createRequest({ raw_prompt: specialPrompt });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockScoring.scorePromptService).toHaveBeenCalledWith(specialPrompt);
  });

  test("should handle multiline prompts", async () => {
    const multilinePrompt = "Write code\nto process\ndata";
    const request = createRequest({ raw_prompt: multilinePrompt });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockScoring.scorePromptService).toHaveBeenCalledWith(
      multilinePrompt,
    );
  });

  test("should return complete score object in response", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("dimensions");
    expect(data).toHaveProperty("missing_slots");
    expect(data).toHaveProperty("issues");
    expect(data).toHaveProperty("diagnostics");
  });

  test("should pass correct Content-Type header", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("should return 429 when rate limit exceeded", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 30,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = createRequest({ raw_prompt: "Write code" });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Rate limit exceeded");
    expect(mockScoring.scorePromptService).not.toHaveBeenCalled();
  });

  test("should include X-RateLimit headers in successful response", async () => {
    const request = createRequest({ raw_prompt: "Write code" });
    mockScoring.scorePromptService.mockResolvedValue(mockScore);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(response.headers.get("X-RateLimit-Remaining")).not.toBeNull();
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });

  test("should include X-RateLimit headers in 429 response", async () => {
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 30,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = createRequest({ raw_prompt: "Write code" });
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });
});
