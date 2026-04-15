import {
  requireAuth,
  requireAdmin,
  isAdmin,
  isUser,
  UnauthorizedError,
} from "@/lib/rbac";
import * as authModule from "@/lib/auth";

jest.mock("@/lib/auth");

const mockAuth = authModule as jest.Mocked<typeof authModule>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("rbac: requireAuth", () => {
  test("should throw UnauthorizedError when no session exists", async () => {
    mockAuth.getAuthSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
    await expect(requireAuth()).rejects.toThrow("Authentication required");
  });

  test("should throw UnauthorizedError when session has no user", async () => {
    mockAuth.getAuthSession.mockResolvedValue({
      user: null,
    } as any);

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
    await expect(requireAuth()).rejects.toThrow("Authentication required");
  });

  test("should return session when user is authenticated", async () => {
    const mockSession = {
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "USER",
      },
    };
    mockAuth.getAuthSession.mockResolvedValue(mockSession as any);

    const result = await requireAuth();

    expect(result).toEqual(mockSession);
  });

  test("should return session with ADMIN role", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockAuth.getAuthSession.mockResolvedValue(mockSession as any);

    const result = await requireAuth();

    expect(result).toEqual(mockSession);
  });
});

describe("rbac: requireAdmin", () => {
  test("should throw UnauthorizedError (401) when no session exists", async () => {
    mockAuth.getAuthSession.mockResolvedValue(null);

    try {
      await requireAdmin();
      fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as Error).message).toBe("Authentication required");
    }
  });

  test("should throw UnauthorizedError (401) when session has no user", async () => {
    mockAuth.getAuthSession.mockResolvedValue({
      user: null,
    } as any);

    try {
      await requireAdmin();
      fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as Error).message).toBe("Authentication required");
    }
  });

  test("should throw UnauthorizedError (403) when user role is not ADMIN", async () => {
    const mockSession = {
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "USER",
      },
    };
    mockAuth.getAuthSession.mockResolvedValue(mockSession as any);

    try {
      await requireAdmin();
      fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as Error).message).toBe("Admin access required");
    }
  });

  test("should return session when user role is ADMIN", async () => {
    const mockSession = {
      user: {
        id: "admin-123",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };
    mockAuth.getAuthSession.mockResolvedValue(mockSession as any);

    const result = await requireAdmin();

    expect(result).toEqual(mockSession);
  });
});

describe("rbac: isAdmin", () => {
  test("should return true when role is ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
  });

  test("should return false when role is USER", () => {
    expect(isAdmin("USER")).toBe(false);
  });

  test("should return false when role is undefined", () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  test("should return false when role is empty string", () => {
    expect(isAdmin("")).toBe(false);
  });

  test("should return false when role is null", () => {
    expect(isAdmin(null as any)).toBe(false);
  });
});

describe("rbac: isUser", () => {
  test("should return true when role is USER", () => {
    expect(isUser("USER")).toBe(true);
  });

  test("should return true when role is ADMIN", () => {
    expect(isUser("ADMIN")).toBe(true);
  });

  test("should return false when role is undefined", () => {
    expect(isUser(undefined)).toBe(false);
  });

  test("should return false when role is empty string", () => {
    expect(isUser("")).toBe(false);
  });

  test("should return false when role is null", () => {
    expect(isUser(null as any)).toBe(false);
  });

  test("should return false when role is an unknown value", () => {
    expect(isUser("MODERATOR")).toBe(false);
  });
});

describe("rbac: UnauthorizedError", () => {
  test("should be an Error instance", () => {
    const error = new UnauthorizedError("Test error");
    expect(error).toBeInstanceOf(Error);
  });

  test("should have correct error name", () => {
    const error = new UnauthorizedError("Test error");
    expect(error.name).toBe("UnauthorizedError");
  });

  test("should preserve error message", () => {
    const message = "Access denied";
    const error = new UnauthorizedError(message);
    expect(error.message).toBe(message);
  });
});
