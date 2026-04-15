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
    user: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth", () => ({
  getAuthSession: jest.fn(),
}));

import { GET, DELETE } from "@/app/api/admin/users/route";
import { requireAdmin, UnauthorizedError } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockGetAuthSession = getAuthSession as jest.MockedFunction<
  typeof getAuthSession
>;
const mockPrismaUser = (prisma as any).user;

beforeEach(() => {
  jest.clearAllMocks();
});

function createRequest(body?: any): NextRequest {
  return {
    json: async () => body,
  } as any;
}

describe("GET /api/admin/users", () => {
  const mockUsers = [
    {
      id: "user-1",
      email: "user1@example.com",
      role: "USER",
      createdAt: new Date("2026-01-01"),
    },
    {
      id: "user-2",
      email: "admin@example.com",
      role: "ADMIN",
      createdAt: new Date("2026-01-02"),
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

  test("should return user list with ADMIN session", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockPrismaUser.findMany.mockResolvedValue(mockUsers);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("users");
    expect(data.users).toHaveLength(2);
    expect(data.users[0].email).toBe("user1@example.com");
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
    mockPrismaUser.findMany.mockResolvedValue([]);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toEqual([]);
  });
});

describe("DELETE /api/admin/users", () => {
  const mockUser = {
    id: "user-to-delete",
    email: "user@example.com",
    role: "USER",
    createdAt: new Date(),
  };

  test("should return 401 when no session", async () => {
    mockRequireAdmin.mockRejectedValue(
      new UnauthorizedError("Authentication required"),
    );

    const request = createRequest({ userId: "user-to-delete" });
    const response = await DELETE(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Authentication required");
  });

  test("should return 403 when user role is not ADMIN", async () => {
    mockRequireAdmin.mockRejectedValue(
      new UnauthorizedError("Admin access required"),
    );

    const request = createRequest({ userId: "user-to-delete" });
    const response = await DELETE(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("Admin access required");
  });

  test("should return 400 if userId is missing", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);

    const request = createRequest({});
    const response = await DELETE(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("userId is required");
  });

  test("should return 400 if trying to delete own account", async () => {
    const adminId = "admin-123";
    const mockSession = {
      user: {
        id: adminId,
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockGetAuthSession.mockResolvedValue(mockSession as any);

    const request = createRequest({ userId: adminId });
    const response = await DELETE(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Cannot delete your own account");
  });

  test("should return 404 if user not found (P2025)", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockGetAuthSession.mockResolvedValue(mockSession as any);
    const error = new Error("User not found");
    (error as any).code = "P2025";
    mockPrismaUser.delete.mockRejectedValue(error);

    const request = createRequest({ userId: "nonexistent-user" });
    const response = await DELETE(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("User not found");
  });

  test("should delete user successfully", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockGetAuthSession.mockResolvedValue(mockSession as any);
    mockPrismaUser.delete.mockResolvedValue(mockUser);

    const request = createRequest({ userId: "user-to-delete" });
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toContain("User deleted successfully");
    expect(data.user.id).toBe("user-to-delete");
    expect(mockPrismaUser.delete).toHaveBeenCalledWith({
      where: { id: "user-to-delete" },
    });
  });

  test("should return 500 on unexpected error", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockRequireAdmin.mockResolvedValue(mockSession as any);
    mockGetAuthSession.mockResolvedValue(mockSession as any);
    mockPrismaUser.delete.mockRejectedValue(new Error("Database error"));

    const request = createRequest({ userId: "user-to-delete" });
    const response = await DELETE(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("Failed to delete user");
  });
});
