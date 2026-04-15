import { GET } from "@/app/api/user/search/route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as rbac from "@/lib/rbac";

jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRbac = rbac as jest.Mocked<typeof rbac>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRbac.requireAuth.mockResolvedValue({
    user: {
      id: "test-user-123",
      email: "test@example.com",
      role: "USER",
    },
  } as any);
});

function createRequest(url: string): NextRequest {
  return {
    nextUrl: {
      searchParams: new URLSearchParams(new URL(url).search),
    },
    headers: {
      get: (key: string) => (key === "x-request-id" ? "test-request-id" : null),
    },
  } as any;
}

describe("GET /api/user/search", () => {
  const mockRecords = [
    {
      id: "record-1",
      raw_prompt: "How to optimize Python code",
      raw_score_total: 45,
      optimized_prompt:
        "How to optimize Python code performance and readability",
      optimized_score_total: 70,
      optimization_explanation: "Added performance context",
      created_at: new Date("2026-04-13T10:00:00Z"),
    },
    {
      id: "record-2",
      raw_prompt: "Write a Python script",
      raw_score_total: 35,
      optimized_prompt: "Write a Python script for data processing",
      optimized_score_total: 60,
      optimization_explanation: "Added specificity",
      created_at: new Date("2026-04-13T09:00:00Z"),
    },
  ];

  it("should search across raw_prompt field", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(
      mockRecords.slice(0, 1),
    );
    mockPrisma.optimizationRecord.count.mockResolvedValue(1);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=optimize",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.query).toBe("optimize");
    expect(data.records).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  it("should search across optimized_prompt field", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=performance",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toHaveLength(2);
  });

  it("should search across optimization_explanation field", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(
      mockRecords.slice(1),
    );
    mockPrisma.optimizationRecord.count.mockResolvedValue(1);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=specificity",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toHaveLength(1);
  });

  it("should return 400 when query is missing", async () => {
    const request = createRequest("http://localhost:3000/api/user/search");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("query");
  });

  it("should return 400 when query is empty", async () => {
    const request = createRequest(
      "http://localhost:3000/api/user/search?q=   ",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("non-empty");
  });

  it("should return 400 when query exceeds max length", async () => {
    const longQuery = "a".repeat(501);
    const request = createRequest(
      `http://localhost:3000/api/user/search?q=${encodeURIComponent(longQuery)}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("exceeds maximum length");
  });

  it("should support pagination with limit", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(
      mockRecords.slice(0, 10),
    );
    mockPrisma.optimizationRecord.count.mockResolvedValue(25);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python&limit=10",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pagination.limit).toBe(10);
    expect(data.pagination.total).toBe(25);
    expect(data.pagination.offset).toBe(0);
  });

  it("should support pagination with offset", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([mockRecords[1]]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python&offset=1&limit=1",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pagination.offset).toBe(1);
    expect(data.pagination.returned).toBe(1);
  });

  it("should enforce max limit of 100", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(100);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python&limit=500",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pagination.limit).toBe(100); // Capped at 100
  });

  it("should return 0 results for no matches", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=nonexistent",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it("should filter results by current user only", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python",
    );
    await GET(request);

    // Verify findMany was called with userId filter
    expect(mockPrisma.optimizationRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "test-user-123",
        }),
      }),
    );
  });

  it("should support case-insensitive search", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=PYTHON",
    );
    await GET(request);

    // Verify search uses insensitive mode
    expect(mockPrisma.optimizationRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              raw_prompt: expect.objectContaining({ mode: "insensitive" }),
            }),
          ]),
        }),
      }),
    );
  });

  it("should return 401 for unauthorized access", async () => {
    mockRbac.requireAuth.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { name: "UnauthorizedError" }),
    );

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python",
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("should include all required fields in response", async () => {
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest(
      "http://localhost:3000/api/user/search?q=python",
    );
    const response = await GET(request);

    const data = await response.json();
    expect(data).toHaveProperty("query");
    expect(data).toHaveProperty("pagination");
    expect(data).toHaveProperty("records");
    expect(data.records[0]).toHaveProperty("id");
    expect(data.records[0]).toHaveProperty("raw_prompt");
    expect(data.records[0]).toHaveProperty("raw_score");
    expect(data.records[0]).toHaveProperty("optimized_prompt");
    expect(data.records[0]).toHaveProperty("optimized_score");
    expect(data.records[0]).toHaveProperty("created_at");
  });
});
