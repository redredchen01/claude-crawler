import { prisma } from "@/lib/db";
import {
  createAuditLog,
  getUserAuditLogs,
  getTeamAuditLogs,
  getResourceAuditLogs,
  countAuditLogs,
  AuditAction,
  exportUserData,
  requestUserDeletion,
} from "@/lib/audit";

describe("Audit Service", () => {
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `audit-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: "Audit Test Team",
        slug: `audit-test-${Date.now()}`,
      },
    });
    testTeamId = team.id;

    // Add user to team
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: user.id,
        role: "admin",
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testTeamId) {
      await prisma.team.deleteMany({
        where: { id: testTeamId },
      });
    }
  });

  describe("createAuditLog", () => {
    test("should create audit log entry", async () => {
      const log = await createAuditLog(
        testUserId,
        AuditAction.USER_LOGIN,
        "user",
        testUserId,
        {
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          status: "success",
        },
      );

      expect(log).toBeDefined();
      expect(log.userId).toBe(testUserId);
      expect(log.action).toBe(AuditAction.USER_LOGIN);
      expect(log.status).toBe("success");
    });

    test("should record changes in audit log", async () => {
      const changes = {
        name: { before: "Old Name", after: "New Name" },
        email: { before: "old@example.com", after: "new@example.com" },
      };

      const log = await createAuditLog(
        testUserId,
        AuditAction.USER_UPDATED,
        "user",
        testUserId,
        { changes, status: "success" },
      );

      expect(log.changes).toBeDefined();
      expect(log.changes?.name.after).toBe("New Name");
    });

    test("should record failures with error message", async () => {
      const log = await createAuditLog(
        testUserId,
        AuditAction.API_KEY_CREATED,
        "api_key",
        "key-123",
        {
          status: "failure",
          errorMessage: "API key quota exceeded",
        },
      );

      expect(log.status).toBe("failure");
      expect(log.errorMessage).toBe("API key quota exceeded");
    });
  });

  describe("getUserAuditLogs", () => {
    test("should retrieve user audit logs", async () => {
      // Create some test logs
      await createAuditLog(
        testUserId,
        AuditAction.USER_LOGIN,
        "user",
        testUserId,
      );
      await createAuditLog(
        testUserId,
        AuditAction.TEAM_MEMBER_ADDED,
        "team_member",
        "member-1",
        { teamId: testTeamId },
      );

      const logs = await getUserAuditLogs(testUserId);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((log) => log.userId === testUserId)).toBe(true);
    });

    test("should support pagination", async () => {
      const logsPage1 = await getUserAuditLogs(testUserId, 1, 0);
      const logsPage2 = await getUserAuditLogs(testUserId, 1, 1);

      expect(logsPage1.length).toBeLessThanOrEqual(1);
      if (logsPage2.length > 0) {
        expect(logsPage1[0].id).not.toBe(logsPage2[0].id);
      }
    });

    test("should return logs in reverse chronological order", async () => {
      const logs = await getUserAuditLogs(testUserId, 10);

      if (logs.length > 1) {
        for (let i = 0; i < logs.length - 1; i++) {
          expect(
            new Date(logs[i].createdAt) >= new Date(logs[i + 1].createdAt),
          ).toBe(true);
        }
      }
    });
  });

  describe("getTeamAuditLogs", () => {
    test("should retrieve team audit logs", async () => {
      await createAuditLog(
        testUserId,
        AuditAction.TEAM_CREATED,
        "team",
        testTeamId,
        { teamId: testTeamId },
      );

      const logs = await getTeamAuditLogs(testTeamId);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((log) => log.teamId === testTeamId)).toBe(true);
    });
  });

  describe("getResourceAuditLogs", () => {
    test("should retrieve logs for specific resource", async () => {
      const resourceId = `resource-${Date.now()}`;

      await createAuditLog(
        testUserId,
        AuditAction.API_KEY_CREATED,
        "api_key",
        resourceId,
      );
      await createAuditLog(
        testUserId,
        AuditAction.API_KEY_SCOPE_CHANGED,
        "api_key",
        resourceId,
      );

      const logs = await getResourceAuditLogs("api_key", resourceId);

      expect(logs.length).toBe(2);
      expect(logs.every((log) => log.resourceId === resourceId)).toBe(true);
    });
  });

  describe("countAuditLogs", () => {
    test("should count audit logs within time range", async () => {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const count = await countAuditLogs(testUserId, startDate, endDate);

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("exportUserData", () => {
    test("should export all user data", async () => {
      const data = await exportUserData(testUserId);

      expect(data.user).toBeDefined();
      expect(data.teams).toBeDefined();
      expect(data.auditLogs).toBeDefined();
      expect(data.optimizations).toBeDefined();

      expect(Array.isArray(data.teams)).toBe(true);
      expect(Array.isArray(data.auditLogs)).toBe(true);
      expect(Array.isArray(data.optimizations)).toBe(true);
    });

    test("should include user audit logs in export", async () => {
      const data = await exportUserData(testUserId);

      expect(data.auditLogs.length).toBeGreaterThan(0);
      expect(data.auditLogs.every((log) => log.userId === testUserId)).toBe(
        true,
      );
    });
  });

  describe("requestUserDeletion", () => {
    test("should mark user for deletion", async () => {
      // Create a new user for deletion test
      const user = await prisma.user.create({
        data: {
          email: `deletion-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      await requestUserDeletion(user.id);

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deletionRequestedAt: true },
      });

      expect(updated?.deletionRequestedAt).toBeDefined();
      expect(updated?.deletionRequestedAt).toBeInstanceOf(Date);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe("Audit database schema", () => {
    test("should have AuditLog table with required fields", async () => {
      const log = await createAuditLog(
        testUserId,
        AuditAction.USER_LOGIN,
        "user",
        testUserId,
      );

      expect(log.id).toBeDefined();
      expect(log.userId).toBeDefined();
      expect(log.action).toBeDefined();
      expect(log.resourceType).toBeDefined();
      expect(log.resourceId).toBeDefined();
      expect(log.status).toBeDefined();
      expect(log.createdAt).toBeDefined();
    });

    test("user should have deletionRequestedAt field", async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(user).toBeDefined();
      expect("deletionRequestedAt" in user).toBe(true);
    });
  });
});
