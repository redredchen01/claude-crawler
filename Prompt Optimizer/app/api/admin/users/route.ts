import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("Admin") ? 403 : 401 },
      );
    }
    logger.error({ route: "/api/admin/users", error: error.message });
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    // Prevent deleting your own account
    const session = await getAuthSession();

    if (session?.user?.id === userId) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 },
      );
    }

    const user = await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({
      message: "User deleted successfully",
      user: { id: user.id, email: user.email },
    });
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("Admin") ? 403 : 401 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    logger.error({
      route: "/api/admin/users",
      method: "DELETE",
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
