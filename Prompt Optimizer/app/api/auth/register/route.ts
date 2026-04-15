import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { email, password, confirmPassword } = body;

    // Validation
    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "USER",
      },
    });

    logger.info(
      {
        route: "/api/auth/register",
        duration_ms: Date.now() - start,
        status: 201,
        userId: user.id,
      },
      "route success",
    );

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        message: "User created successfully",
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error({ route: "/api/auth/register", error: error.message });
    return NextResponse.json(
      { error: error.message || "Failed to create user" },
      { status: 500 },
    );
  }
}
