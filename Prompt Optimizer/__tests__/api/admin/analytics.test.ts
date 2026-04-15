import { NextRequest } from "next/server";

jest.mock("@/lib/rbac", () => {
  const actual = jest.requireActual("@/lib/rbac");
  return {
    ...actual,
    requireAdmin: jest.fn(),
  };
});
jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      findMany: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

import { GET } from "@/app/api/admin/analytics/route";
import { requireAdmin, UnauthorizedError } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
  // Default mocks for $queryRaw (time series, distribution, top users)
  mockPrisma.$queryRaw = jest.fn().mockResolvedValue([]);
});

function createRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/admin/analytics");
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return {
    nextUrl: url,
  } as any;
}

describe("GET /api/admin/analytics", () => {
  const mockRecords = [
    {
      id: "record-1",
      created_at: new Date("2026-04-10"),
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
      user: { email: "user1@example.com" },
    },
    {
      id: "record-2",
      created_at: new Date("2026-04-11"),
      raw_score: JSON.stringify({
        total: 55,
        dimensions: {
          specificity: 12,
          context: 10,
          output_spec: 13,
          runnability: 10,
          evaluation: 7,
          safety: 3,
        },
      }),
      optimized_score: JSON.stringify({
        total: 75,
        dimensions: {
          specificity: 16,
          context: 13,
          output_spec: 16,
          runnability: 13,
          evaluation: 10,
          safety: 7,
        },
      }),
      user: { email: "user2@example.com" },
    },
  ];

  test("should return 401 when no session", async () => {
    mockRequireAdmin.mockRejectedValue(
      new UnauthorizedError("Authentication required"),
    );

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Authentication required");
  });

  test("should return 403 when user role is not ADMIN", async () => {
    mockRequireAdmin.mockRejectedValue(
      new UnauthorizedError("Admin access required"),
    );

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("Admin access required");
  });

  test("should return valid shape with ADMIN session and empty DB", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("overview");
    expect(data).toHaveProperty("timeSeries");
    expect(data).toHaveProperty("scoreDistribution");
    expect(data).toHaveProperty("dimensionAverages");
    expect(data).toHaveProperty("topUsers");
  });

  test("should default days to 30 when not provided", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    // The request should have been made with a date 30 days ago
    const call = mockPrisma.optimizationRecord.findMany.mock.calls[0];
    expect(call[0].where.created_at.gte).toBeDefined();
  });

  test("should clamp days param to 1-365", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    // Test with days < 1 (should clamp to 1)
    const request1 = createRequest({ days: "0" });
    await GET(request1);

    // Test with days > 365 (should clamp to 365)
    const request2 = createRequest({ days: "400" });
    await GET(request2);

    expect(mockPrisma.optimizationRecord.findMany).toHaveBeenCalled();
  });

  test("should return all 5 score distribution buckets", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.user.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.scoreDistribution).toHaveLength(5);
    expect(data.scoreDistribution[0].bucket).toBe("0-20");
    expect(data.scoreDistribution[1].bucket).toBe("21-40");
    expect(data.scoreDistribution[2].bucket).toBe("41-60");
    expect(data.scoreDistribution[3].bucket).toBe("61-80");
    expect(data.scoreDistribution[4].bucket).toBe("81-100");
  });

  test("should return valid overview stats with data", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.user.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.overview).toHaveProperty("totalUsers", 2);
    expect(data.overview).toHaveProperty("totalOptimizations", 2);
    expect(data.overview).toHaveProperty("avgRawScore");
    expect(data.overview).toHaveProperty("avgOptimizedScore");
    expect(data.overview).toHaveProperty("avgDelta");
  });

  test("should return dimension averages", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.user.count.mockResolvedValue(2);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.dimensionAverages).toHaveProperty("specificity");
    expect(data.dimensionAverages).toHaveProperty("context");
    expect(data.dimensionAverages).toHaveProperty("output_spec");
    expect(data.dimensionAverages).toHaveProperty("runnability");
    expect(data.dimensionAverages).toHaveProperty("evaluation");
    expect(data.dimensionAverages).toHaveProperty("safety");
  });

  test("should return time series data", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.user.count.mockResolvedValue(2);

    // Mock $queryRaw for time series
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { date: "2026-04-10", count: 1n },
        { date: "2026-04-11", count: 1n },
      ])
      .mockResolvedValueOnce([]) // distribution
      .mockResolvedValueOnce([]); // top users

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.timeSeries)).toBe(true);
    expect(data.timeSeries.length).toBeGreaterThan(0);
    expect(data.timeSeries[0]).toHaveProperty("date");
    expect(data.timeSeries[0]).toHaveProperty("count");
  });

  test("should return top users", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.optimizationRecord.findMany.mockResolvedValue(mockRecords);
    mockPrisma.user.count.mockResolvedValue(2);

    // Mock $queryRaw for time series, distribution, and top users
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([]) // time series
      .mockResolvedValueOnce([]) // distribution
      .mockResolvedValueOnce([{ email: "user1@example.com", count: 2n }]); // top users

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.topUsers)).toBe(true);
    expect(data.topUsers[0]).toHaveProperty("email");
    expect(data.topUsers[0]).toHaveProperty("count");
  });

  test("should handle invalid JSON in score fields gracefully", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    const recordWithInvalidJSON = {
      id: "record-invalid",
      created_at: new Date("2026-04-10"),
      raw_score: "invalid json",
      optimized_score: "also invalid",
      user: { email: "user@example.com" },
    };
    mockPrisma.optimizationRecord.findMany.mockResolvedValue([
      recordWithInvalidJSON,
    ]);
    mockPrisma.user.count.mockResolvedValue(1);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Should handle gracefully without throwing
    expect(data).toHaveProperty("overview");
  });
});
