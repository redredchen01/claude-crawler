jest.mock("@/lib/rbac", () => {
  const actual = jest.requireActual("@/lib/rbac");
  return {
    ...actual,
    requireAdmin: jest.fn(),
  };
});
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    optimizationRecord: {
      count: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/admin/stats/route";
import { requireAdmin, UnauthorizedError } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
});

function createRequest(): NextRequest {
  return {} as any;
}

describe("GET /api/admin/stats", () => {
  const mockUsers = [
    {
      id: "user-1",
      email: "user1@example.com",
      _count: { records: 5 },
    },
    {
      id: "user-2",
      email: "user2@example.com",
      _count: { records: 3 },
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

  test("should return stats object with ADMIN session", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.user.count.mockResolvedValue(2);
    mockPrisma.optimizationRecord.count.mockResolvedValue(8);
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("stats");
    expect(data.stats).toHaveProperty("totalUsers", 2);
    expect(data.stats).toHaveProperty("totalOptimizations", 8);
    expect(data.stats).toHaveProperty("recordsByUser");
  });

  test("should return correct stats structure", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.user.count.mockResolvedValue(2);
    mockPrisma.optimizationRecord.count.mockResolvedValue(8);
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.recordsByUser).toHaveLength(2);
    expect(data.stats.recordsByUser[0]).toHaveProperty("email");
    expect(data.stats.recordsByUser[0]).toHaveProperty("count");
    expect(data.stats.recordsByUser[0].email).toBe("user1@example.com");
    expect(data.stats.recordsByUser[0].count).toBe(5);
  });

  test("should handle empty user list", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.totalUsers).toBe(0);
    expect(data.stats.totalOptimizations).toBe(0);
    expect(data.stats.recordsByUser).toEqual([]);
  });

  test("should handle users with no records", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    const usersWithZeroRecords = [
      {
        id: "user-1",
        email: "user1@example.com",
        _count: { records: 0 },
      },
    ];
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.optimizationRecord.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue(usersWithZeroRecords);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.recordsByUser[0].count).toBe(0);
  });

  test("should handle large number of optimizations", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    const usersWithManyRecords = [
      {
        id: "user-1",
        email: "user1@example.com",
        _count: { records: 1000 },
      },
    ];
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.optimizationRecord.count.mockResolvedValue(1000);
    mockPrisma.user.findMany.mockResolvedValue(usersWithManyRecords);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.totalOptimizations).toBe(1000);
    expect(data.stats.recordsByUser[0].count).toBe(1000);
  });
});
