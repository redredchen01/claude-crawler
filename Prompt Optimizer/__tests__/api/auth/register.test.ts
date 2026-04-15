import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

jest.mock("bcryptjs");
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/db";

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockPrismaUser = (prisma as any).user;

beforeEach(() => {
  jest.clearAllMocks();
});

function createRequest(body: any): NextRequest {
  return {
    json: async () => body,
  } as any;
}

describe("POST /api/auth/register", () => {
  const validUser = {
    id: "user-123",
    email: "test@example.com",
    password: "hashed_password_123",
    role: "USER",
    createdAt: new Date(),
  };

  test("should return 400 if email is missing", async () => {
    const request = createRequest({
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("should return 400 if password is missing", async () => {
    const request = createRequest({
      email: "test@example.com",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("should return 400 if confirmPassword is missing", async () => {
    const request = createRequest({
      email: "test@example.com",
      password: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("should return 400 if passwords do not match", async () => {
    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password456",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Passwords do not match");
  });

  test("should return 400 if password is less than 6 characters", async () => {
    const request = createRequest({
      email: "test@example.com",
      password: "pass1",
      confirmPassword: "pass1",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Password must be at least 6 characters");
  });

  test("should return 409 if user already exists", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("User already exists");
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
  });

  test("should return 201 with user data on successful registration", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("email");
    expect(data).toHaveProperty("role");
    expect(data.email).toBe("test@example.com");
    expect(data.role).toBe("USER");
    expect(data.message).toContain("User created successfully");
  });

  test("should hash password before storing", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockBcrypt.hash).toHaveBeenCalledWith("password123", 10);
    expect(mockPrismaUser.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        password: "hashed_password_123",
        role: "USER",
      },
    });
  });

  test("should not store plaintext password", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await POST(request);

    const createCall = mockPrismaUser.create.mock.calls[0];
    expect(createCall[0].data.password).not.toBe("password123");
    expect(createCall[0].data.password).toBe("hashed_password_123");
  });

  test("should set role to USER for new users", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.role).toBe("USER");
  });

  test("should accept password at minimum boundary (6 chars)", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue(validUser);

    const request = createRequest({
      email: "test@example.com",
      password: "passwor",
      confirmPassword: "passwor",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  test("should return 500 on database error", async () => {
    mockPrismaUser.findUnique.mockRejectedValue(
      new Error("Database connection failed"),
    );

    const request = createRequest({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("Database connection failed");
  });

  test("should handle emails with special characters", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed_password_123");
    mockPrismaUser.create.mockResolvedValue({
      ...validUser,
      email: "test+alias@example.com",
    });

    const request = createRequest({
      email: "test+alias@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.email).toBe("test+alias@example.com");
  });
});
