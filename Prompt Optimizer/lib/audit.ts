import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export enum AuditAction {
  // User actions
  USER_CREATED = "user_created",
  USER_UPDATED = "user_updated",
  USER_DELETED = "user_deleted",
  USER_LOGIN = "user_login",
  USER_LOGOUT = "user_logout",
  USER_PASSWORD_CHANGED = "user_password_changed",

  // Team actions
  TEAM_CREATED = "team_created",
  TEAM_UPDATED = "team_updated",
  TEAM_DELETED = "team_deleted",
  TEAM_MEMBER_ADDED = "team_member_added",
  TEAM_MEMBER_REMOVED = "team_member_removed",
  TEAM_MEMBER_ROLE_CHANGED = "team_member_role_changed",
  TEAM_QUOTA_UPDATED = "team_quota_updated",

  // API key actions
  API_KEY_CREATED = "api_key_created",
  API_KEY_ROTATED = "api_key_rotated",
  API_KEY_DELETED = "api_key_deleted",
  API_KEY_SCOPE_CHANGED = "api_key_scope_changed",

  // Billing actions
  BILLING_CUSTOMER_CREATED = "billing_customer_created",
  BILLING_PAYMENT_METHOD_ADDED = "billing_payment_method_added",
  BILLING_PAYMENT_METHOD_REMOVED = "billing_payment_method_removed",
  BILLING_SUBSCRIPTION_CREATED = "billing_subscription_created",
  BILLING_SUBSCRIPTION_CANCELLED = "billing_subscription_cancelled",

  // Data actions
  DATA_EXPORT_REQUESTED = "data_export_requested",
  DATA_DELETION_REQUESTED = "data_deletion_requested",
  DATA_DELETED = "data_deleted",

  // Optimization actions
  OPTIMIZATION_REQUESTED = "optimization_requested",
  OPTIMIZATION_COMPLETED = "optimization_completed",

  // Admin dashboard actions
  ADMIN_DASHBOARD_VIEWED = "admin_dashboard_viewed",
  ADMIN_BATCH_STATS_VIEWED = "admin_batch_stats_viewed",
  ADMIN_BATCH_TIMELINE_VIEWED = "admin_batch_timeline_viewed",
  ADMIN_BATCH_LIST_VIEWED = "admin_batch_list_viewed",
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  teamId?: string;
  action: AuditAction;
  resourceType: string; // 'user', 'team', 'api_key', etc.
  resourceId: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failure";
  errorMessage?: string;
  createdAt: Date;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  userId: string,
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  options?: {
    teamId?: string;
    changes?: Record<string, { before?: unknown; after?: unknown }>;
    ipAddress?: string;
    userAgent?: string;
    status?: "success" | "failure";
    errorMessage?: string;
  },
): Promise<AuditLogEntry> {
  const log = await prisma.auditLog.create({
    data: {
      userId,
      teamId: options?.teamId,
      action,
      resourceType,
      resourceId,
      changes: options?.changes ? JSON.stringify(options.changes) : null,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      status: options?.status || "success",
      errorMessage: options?.errorMessage,
    },
  });

  logger.info(
    {
      auditId: log.id,
      userId,
      action,
      resourceType,
      status: log.status,
    },
    "Audit log created",
  );

  return {
    ...log,
    action: log.action as AuditAction,
    teamId: log.teamId || undefined,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
    errorMessage: log.errorMessage || undefined,
    changes: log.changes ? JSON.parse(log.changes) : undefined,
  };
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100,
  offset: number = 0,
): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return logs.map((log) => ({
    ...log,
    changes: log.changes ? JSON.parse(log.changes) : undefined,
  }));
}

/**
 * Get audit logs for a team
 */
export async function getTeamAuditLogs(
  teamId: string,
  limit: number = 100,
  offset: number = 0,
): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return logs.map((log) => ({
    ...log,
    changes: log.changes ? JSON.parse(log.changes) : undefined,
  }));
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
  resourceType: string,
  resourceId: string,
): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { resourceType, resourceId },
    orderBy: { createdAt: "desc" },
  });

  return logs.map((log) => ({
    ...log,
    changes: log.changes ? JSON.parse(log.changes) : undefined,
  }));
}

/**
 * Count audit logs within a time range
 */
export async function countAuditLogs(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  return await prisma.auditLog.count({
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
}

/**
 * Archive old audit logs (older than specified days)
 * In production, these could be exported to cold storage
 */
export async function archiveOldAuditLogs(
  daysOld: number = 90,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  logger.info(
    { deletedCount: result.count, cutoffDate },
    "Old audit logs archived",
  );

  return result.count;
}

/**
 * Export user data for GDPR/compliance
 */
export async function exportUserData(userId: string): Promise<{
  user: unknown;
  teams: unknown[];
  auditLogs: AuditLogEntry[];
  optimizations: unknown[];
}> {
  const [user, teams, auditLogs, optimizations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.team.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
    }),
    getUserAuditLogs(userId, 10000),
    prisma.optimizationRecord.findMany({
      where: { userId },
      select: {
        id: true,
        raw_prompt: true,
        raw_score_total: true,
        optimized_score_total: true,
        created_at: true,
      },
    }),
  ]);

  return {
    user: user || {},
    teams,
    auditLogs,
    optimizations,
  };
}

/**
 * Request user data deletion (soft delete for compliance)
 * Actual deletion happens after retention period
 */
export async function requestUserDeletion(userId: string): Promise<void> {
  // Mark user for deletion after retention period
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: new Date(),
    },
  });

  logger.info({ userId }, "User deletion requested");
}

/**
 * Permanently delete user data after retention period
 * Should be called by a scheduled job
 */
export async function permanentlyDeleteUser(
  userId: string,
  retentionDays: number = 30,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true },
  });

  if (!user || !user.deletionRequestedAt) {
    throw new Error("User has no pending deletion request");
  }

  const now = new Date();
  const retentionDate = new Date(user.deletionRequestedAt);
  retentionDate.setDate(retentionDate.getDate() + retentionDays);

  if (now < retentionDate) {
    throw new Error(
      `User data must be retained until ${retentionDate.toISOString()}`,
    );
  }

  // Delete all user data
  await Promise.all([
    prisma.auditLog.deleteMany({ where: { userId } }),
    prisma.optimizationRecord.deleteMany({ where: { userId } }),
    prisma.apiKey.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.teamMember.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  logger.info({ userId }, "User permanently deleted");
}
