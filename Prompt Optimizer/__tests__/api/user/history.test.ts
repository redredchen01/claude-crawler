jest.mock("@/lib/rbac", () => {
  const actual = jest.requireActual("@/lib/rbac");
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});
jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/user/history/route";
import { requireAuth, UnauthorizedError } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
  // Default mock for aggregate
  mockPrisma.optimizationRecord.aggregate.mockResolvedValue({
    _avg: {
      raw_score_total: 0,
      optimized_score_total: 0,
    },
  });
});

function createRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/user/history");
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return {
    nextUrl: url,
  } as any;
}

describe("GET /api/user/history", () => {
  const userId = "user-123";
  const mockSession = {
    user: {
      id: userId,
      email: "test@example.com",
      role: "USER",
    },
  };

  const mockRecords = [
    {
      id: "record-1",
      created_at: new Date("2026-04-11"),
      raw_score: JSON.stringify({
        total: 45,
        dimensions: {
          specificity: 10,
          context: 8,
          output_spec: 12,
          runnability: 8,
          evaluation: 5,
          safety: 2,
        },
      }),
      optimized_score: JSON.stringify({
        total: 65,
        dimensions: {
          specificity: 15,
          context: 12,
          output_spec: 15,
          runnability: 12,
          evaluation: 8,
          safety: 3,
        },
      }),
    },
    {
      id: "record-2",
      created_at: new Date("2026-04-10"),
      raw_score: JSON.stringify({
        total: 50,
        dimensions: {
          specificity: 12,
          context: 9,
          output_spec: 13,
          runnability: 9,
          evaluation: 5,
          safety: 2,
        },
      }),
      optimized_score: JSON.stringify({
        total: 70,
        dimensions: {
          specificity: 16,
          context: 13,
          output_spec: 16,
          runnability: 13,
          evaluation: 8,
          safety: 4,
        },
      }),
    },
  ];

  test("should return 401 when no session", async () => {
    mockRequireAuth.mockRejectedValue(
      new UnauthorizedError("Authentication required"),
    );

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Authentication required");
  });

  test("should return only records belonging to current user", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    // Verify that the query filters by userId
    expect(call[0].where.userId).toBe(userId);
  });

  test("should default limit to 50 when not provided", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    expect(call[0].take).toBe(50);
  });

  test("should clamp limit to 1-500", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);

    // Test with limit < 1
    const request1 = createRequest({ limit: "0" });
    await GET(request1);
    let call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    expect(call[0].take).toBe(1);

    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);

    // Test with limit > 500
    const request2 = createRequest({ limit: "600" });
    await GET(request2);
    call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    expect(call[0].take).toBe(500);
  });

  test("should return correct record structure", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("records");
    expect(data).toHaveProperty("stats");
    expect(data.records).toHaveLength(2);

    const record = data.records[0];
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("created_at");
    expect(record).toHaveProperty("raw_score");
    expect(record).toHaveProperty("optimized_score");
    expect(record).toHaveProperty("delta");
  });

  test("should calculate delta correctly", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    const record = data.records[0];
    expect(record.delta).toBe(20); // 65 - 45
  });

  test("should return correct stats for non-empty history", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats).toHaveProperty("totalCount", 2);
    expect(data.stats).toHaveProperty("avgRawScore");
    expect(data.stats).toHaveProperty("avgOptimizedScore");
    expect(data.stats).toHaveProperty("avgDelta");
  });

  test("should return zero-valued stats for user with no history", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toEqual([]);
    expect(data.stats.totalCount).toBe(0);
    expect(data.stats.avgRawScore).toBe(0);
    expect(data.stats.avgOptimizedScore).toBe(0);
    expect(data.stats.avgDelta).toBe(0);
  });

  test("should handle invalid JSON in score fields gracefully", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    const recordWithInvalidJSON = {
      id: "record-invalid",
      created_at: new Date("2026-04-11"),
      raw_score: "invalid json",
      raw_score_total: null,
      optimized_score: "also invalid",
      optimized_score_total: null,
    };
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([
      recordWithInvalidJSON,
    ]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(1);
    mockPrisma.optimizationRecord.aggregate.mockResolvedValue({
      _avg: {
        raw_score_total: null,
        optimized_score_total: null,
      },
    });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Should handle gracefully - set scores to 0
    expect(data.records[0].raw_score).toBe(0);
    expect(data.records[0].optimized_score).toBe(0);
  });

  test("should handle records with missing score fields", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    const recordWithNullScore = {
      id: "record-null",
      created_at: new Date("2026-04-11"),
      raw_score: null,
      optimized_score: null,
    };
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([
      recordWithNullScore,
    ]);
    mockPrisma.optimizationRecord.count.mockResolvedValue(1);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records[0].raw_score).toBe(0);
    expect(data.records[0].optimized_score).toBe(0);
  });

  test("should order records by creation date descending", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);

    const request = createRequest();
    await GET(request);

    const call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    expect(call[0].orderBy.created_at).toBe("desc");
  });

  test("should round average scores to 1 decimal place", async () => {
    mockRequireAuth.mockResolvedValue(mockSession as any);
    // Create records that will produce a non-round average
    const recordsForRounding = [
      {
        id: "record-1",
        created_at: new Date("2026-04-11"),
        raw_score: JSON.stringify({
          total: 45.3,
          dimensions: {},
        }),
        raw_score_total: 45,
        optimized_score: JSON.stringify({
          total: 65.7,
          dimensions: {},
        }),
        optimized_score_total: 66,
      },
      {
        id: "record-2",
        created_at: new Date("2026-04-10"),
        raw_score: JSON.stringify({
          total: 44.4,
          dimensions: {},
        }),
        raw_score_total: 44,
        optimized_score: JSON.stringify({
          total: 64.1,
          dimensions: {},
        }),
        optimized_score_total: 64,
      },
    ];
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(
      recordsForRounding,
    );
    mockPrisma.optimizationRecord.count.mockResolvedValue(2);
    mockPrisma.optimizationRecord.aggregate.mockResolvedValue({
      _avg: {
        raw_score_total: 44.5,
        optimized_score_total: 65,
      },
    });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Average of 45 and 44 = 44.5, rounded to 1 decimal = 44.5
    expect(data.stats.avgRawScore).toBe(44.5);
  });
});
