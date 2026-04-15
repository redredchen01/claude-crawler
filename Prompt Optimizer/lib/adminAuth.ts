import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { createAuditLog, AuditAction } from "@/lib/audit";
import logger from "@/lib/logger";

export interface AdminSession {
  userId: string;
  role: string;
  teamId?: string;
  email: string;
}

/**
 * Verify admin access and log audit trail
 */
export async function requireAdminWithAudit(
  request: NextRequest,
  action: AuditAction,
  resourceType: string = "admin_dashboard",
): Promise<AdminSession> {
  const requestId = request.headers.get("x-request-id");
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    const session = await requireAdmin();

    // Log successful admin access
    await createAuditLog(
      session.user.id,
      action,
      resourceType,
      "admin_access",
      {
        route: request.nextUrl.pathname,
        method: request.method,
        status: "success",
        ipAddress,
      },
    );

    logger.info(
      {
        userId: session.user.id,
        route: request.nextUrl.pathname,
        action,
        requestId,
      },
      "Admin access granted",
    );

    return {
      userId: session.user.id,
      role: session.user.role,
      teamId: session.user.teamId,
      email: session.user.email,
    };
  } catch (error: any) {
    const errorMessage = error.message || "Admin access denied";

    // Log failed admin access attempt
    if (error.name === "UnauthorizedError") {
      await createAuditLog(
        "unknown",
        action,
        resourceType,
        "admin_access_denied",
        {
          route: request.nextUrl.pathname,
          method: request.method,
          status: "failure",
          error: errorMessage,
          ipAddress,
        },
      );

      logger.warn(
        {
          route: request.nextUrl.pathname,
          error: errorMessage,
          requestId,
          ipAddress,
        },
        "Unauthorized admin access attempt",
      );
    }

    throw error;
  }
}

/**
 * Rate limit admin operations by user
 */
export async function checkAdminRateLimit(
  userId: string,
  operation: string,
  limit: number = 100,
  windowSeconds: number = 60,
): Promise<boolean> {
  // In-memory rate limiting for admin operations
  // Can be upgraded to Redis in production
  const key = `admin:${userId}:${operation}`;
  const now = Date.now();

  if (!adminRateLimitStore.has(key)) {
    adminRateLimitStore.set(key, []);
  }

  const timestamps = adminRateLimitStore.get(key)!;

  // Remove old timestamps outside the window
  const windowStart = now - windowSeconds * 1000;
  const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

  if (recentTimestamps.length >= limit) {
    return false; // Rate limit exceeded
  }

  recentTimestamps.push(now);
  adminRateLimitStore.set(key, recentTimestamps);

  return true; // Rate limit OK
}

// Simple in-memory store for admin rate limiting
const adminRateLimitStore = new Map<string, number[]>();

/**
 * Verify admin scopes/permissions
 */
export function hasAdminScope(
  session: AdminSession,
  requiredScope: "view" | "manage" | "delete" = "view",
): boolean {
  // Admin role has all scopes
  if (session.role === "admin") {
    return true;
  }

  // Non-admin users don't have admin dashboard access
  return false;
}

/**
 * Check if admin can manage specific resource
 */
export function canManageResource(
  session: AdminSession,
  resourceOwnerId: string,
  resourceTeamId?: string,
): boolean {
  // System admin can manage anything
  if (session.role === "admin") {
    return true;
  }

  // Team admin can manage team resources
  if (
    session.role === "team_admin" &&
    resourceTeamId &&
    session.teamId === resourceTeamId
  ) {
    return true;
  }

  // Users can only manage their own resources
  if (session.userId === resourceOwnerId) {
    return true;
  }

  return false;
}
