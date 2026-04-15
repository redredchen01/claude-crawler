import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export interface TeamWithMembers {
  id: string;
  name: string;
  slug: string;
  orgId?: string | null;
  members: Array<{
    id: string;
    userId: string;
    role: string;
  }>;
  quotas?: Array<{
    monthlyLimit: number;
    currentUsage: number;
    resetAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new team
 * @param userId - Creator user ID (will be added as admin)
 * @param name - Team name
 * @param slug - URL-safe slug (must be unique)
 * @returns Created team with creator as admin member
 */
export async function createTeam(
  userId: string,
  name: string,
  slug: string,
): Promise<any> {
  // Validate slug format
  if (!/^[a-z0-9-_]+$/.test(slug)) {
    throw new Error(
      "Slug must contain only lowercase letters, numbers, dashes, and underscores",
    );
  }

  try {
    const team = await prisma.team.create({
      data: {
        name,
        slug,
      },
    });

    // Add creator as admin member
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId,
        role: "admin",
      },
    });

    // Initialize team quota with default monthly limit
    const monthlyLimit = parseInt(
      process.env.TEAM_QUOTA_DEFAULT || "100000",
      10,
    );
    await prisma.teamQuota.create({
      data: {
        teamId: team.id,
        monthlyLimit,
        resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    });

    logger.info({ teamId: team.id, userId, slug }, "Team created");
    return team;
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
      throw new Error(`Slug "${slug}" is already taken`);
    }
    throw error;
  }
}

/**
 * Get team by ID if user is a member
 */
export async function getTeamById(
  teamId: string,
  userId: string,
): Promise<TeamWithMembers | null> {
  // Verify user is member of team
  const membership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId,
    },
  });

  if (!membership) {
    return null;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: {
          id: true,
          userId: true,
          role: true,
        },
      },
      quotas: {
        select: {
          monthlyLimit: true,
          currentUsage: true,
          resetAt: true,
        },
      },
    },
  });

  return team as TeamWithMembers;
}

/**
 * List all teams user is member of
 */
export async function listUserTeams(
  userId: string,
): Promise<TeamWithMembers[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          members: {
            select: {
              id: true,
              userId: true,
              role: true,
            },
          },
          quotas: {
            select: {
              monthlyLimit: true,
              currentUsage: true,
              resetAt: true,
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map((m) => m.team) as TeamWithMembers[];
}

/**
 * Add team member (admin only)
 */
export async function addTeamMember(
  teamId: string,
  requestingUserId: string,
  targetUserId: string,
  role: "admin" | "editor" | "viewer",
): Promise<any> {
  // Verify requester is admin
  const requesterMembership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: requestingUserId,
    },
  });

  if (!requesterMembership || requesterMembership.role !== "admin") {
    throw new Error("Only team admins can add members");
  }

  // Check if target is already member
  const existingMembership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: targetUserId,
    },
  });

  if (existingMembership) {
    throw new Error("User is already a team member");
  }

  const member = await prisma.teamMember.create({
    data: {
      teamId,
      userId: targetUserId,
      role,
    },
  });

  logger.info(
    { teamId, addedBy: requestingUserId, userId: targetUserId, role },
    "Team member added",
  );
  return member;
}

/**
 * Remove team member (admin only)
 * Prevents removing the last admin member
 */
export async function removeTeamMember(
  teamId: string,
  requestingUserId: string,
  targetUserId: string,
): Promise<void> {
  // Verify requester is admin
  const requesterMembership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: requestingUserId,
    },
  });

  if (!requesterMembership || requesterMembership.role !== "admin") {
    throw new Error("Only team admins can remove members");
  }

  // If removing self, check we're not the last admin
  if (requestingUserId === targetUserId) {
    const adminCount = await prisma.teamMember.count({
      where: {
        teamId,
        role: "admin",
      },
    });

    if (adminCount === 1) {
      throw new Error("Cannot remove the last admin member from team");
    }
  }

  await prisma.teamMember.deleteMany({
    where: {
      teamId,
      userId: targetUserId,
    },
  });

  logger.info(
    { teamId, removedBy: requestingUserId, userId: targetUserId },
    "Team member removed",
  );
}

/**
 * Update team monthly quota (admin only)
 */
export async function updateTeamQuota(
  teamId: string,
  userId: string,
  newLimit: number,
): Promise<any> {
  // Verify requester is admin
  const membership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId,
    },
  });

  if (!membership || membership.role !== "admin") {
    throw new Error("Only team admins can update quotas");
  }

  const quota = await prisma.teamQuota.update({
    where: { teamId },
    data: {
      monthlyLimit: newLimit,
      currentUsage: 0, // Reset usage when limit changes
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  logger.info({ teamId, updatedBy: userId, newLimit }, "Team quota updated");
  return quota;
}

/**
 * Increment team quota usage
 * Called after optimization/scoring request
 */
export async function incrementTeamQuotaUsage(
  teamId: string,
  amount: number,
): Promise<void> {
  const quota = await prisma.teamQuota.findUnique({
    where: { teamId },
  });

  if (!quota) {
    logger.warn({ teamId }, "Team quota not found");
    return;
  }

  // Check if reset window has expired
  const now = new Date();
  let newUsage = quota.currentUsage + amount;
  let resetAt = quota.resetAt;

  if (now > quota.resetAt) {
    // Window expired, reset
    newUsage = amount;
    resetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  await prisma.teamQuota.update({
    where: { teamId },
    data: {
      currentUsage: newUsage,
      resetAt,
    },
  });

  // Log warning if approaching limit
  const percentUsed = (newUsage / quota.monthlyLimit) * 100;
  if (percentUsed > 90) {
    logger.warn(
      {
        teamId,
        usage: newUsage,
        limit: quota.monthlyLimit,
        percent: percentUsed.toFixed(1),
      },
      "Team quota usage high",
    );
  }
}

/**
 * Get current team quota and usage
 */
export async function getTeamQuota(teamId: string): Promise<any> {
  const quota = await prisma.teamQuota.findUnique({
    where: { teamId },
  });

  if (!quota) {
    throw new Error("Team quota not found");
  }

  // Check if reset window has expired
  const now = new Date();
  if (now > quota.resetAt) {
    // Window expired, reset
    return prisma.teamQuota.update({
      where: { teamId },
      data: {
        currentUsage: 0,
        resetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return quota;
}

/**
 * Check if team is within quota
 */
export async function isTeamWithinQuota(
  teamId: string,
  requestAmount: number = 1,
): Promise<boolean> {
  const quota = await getTeamQuota(teamId);
  return quota.currentUsage + requestAmount <= quota.monthlyLimit;
}
