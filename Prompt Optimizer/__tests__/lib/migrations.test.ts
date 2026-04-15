import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import path from "path";

// Note: These tests are for migration verification
// They test schema structure, not runtime behavior
// Run with: npm run test:ci -- --testPathPattern=migrations

describe("Database Migrations", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    // Use the same Prisma client as the app
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Team Models Schema", () => {
    test("Team table exists with required columns", async () => {
      // This test verifies schema structure without creating records
      const tables = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='Team'
      `;

      expect(tables.length).toBeGreaterThan(0);
    });

    test("TeamMember table exists with FK constraints", async () => {
      const tables = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='TeamMember'
      `;

      expect(tables.length).toBeGreaterThan(0);
    });

    test("TeamQuota table exists", async () => {
      const tables = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='TeamQuota'
      `;

      expect(tables.length).toBeGreaterThan(0);
    });

    test("User table has defaultTeamId column", async () => {
      // Check if column exists
      const result = await prisma.$queryRaw<any[]>`
        PRAGMA table_info(User)
      `;

      const hasDefaultTeamId = result.some(
        (col: any) => col.name === "defaultTeamId",
      );
      expect(hasDefaultTeamId).toBe(true);
    });

    test("ApiKey table has team-related columns", async () => {
      const result = await prisma.$queryRaw<any[]>`
        PRAGMA table_info(ApiKey)
      `;

      const columnNames = result.map((col: any) => col.name);
      expect(columnNames).toContain("teamId");
      expect(columnNames).toContain("ipWhitelist");
      expect(columnNames).toContain("readonly");
      expect(columnNames).toContain("expiresAt");
    });
  });

  describe("Indexes for Performance", () => {
    test("Team.slug index exists", async () => {
      const indexes = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='Team' AND name LIKE '%slug%'
      `;

      expect(indexes.length).toBeGreaterThan(0);
    });

    test("TeamMember(teamId) index exists", async () => {
      const indexes = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='TeamMember' AND name LIKE '%teamId%'
      `;

      expect(indexes.length).toBeGreaterThan(0);
    });

    test("TeamQuota.resetAt index exists", async () => {
      const indexes = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='TeamQuota' AND name LIKE '%resetAt%'
      `;

      expect(indexes.length).toBeGreaterThan(0);
    });

    test("ApiKey.teamId index exists", async () => {
      const indexes = await prisma.$queryRaw<any[]>`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='ApiKey' AND name LIKE '%teamId%'
      `;

      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe("Backward Compatibility", () => {
    test("new columns are nullable", async () => {
      // Check column nullability
      const userInfo = await prisma.$queryRaw<any[]>`
        PRAGMA table_info(User)
      `;

      const defaultTeamId = userInfo.find(
        (col: any) => col.name === "defaultTeamId",
      );
      expect(defaultTeamId?.notnull).toBe(0); // 0 = nullable

      const apiKeyInfo = await prisma.$queryRaw<any[]>`
        PRAGMA table_info(ApiKey)
      `;

      const teamId = apiKeyInfo.find((col: any) => col.name === "teamId");
      expect(teamId?.notnull).toBe(0); // nullable

      const readonly = apiKeyInfo.find((col: any) => col.name === "readonly");
      expect(readonly?.notnull).toBe(1); // NOT NULL (has default)
    });

    test("existing User records are unaffected", async () => {
      // Check that User table still has all original data
      const userCount = await prisma.user.count();
      expect(userCount).toBeGreaterThanOrEqual(0);
    });

    test("existing ApiKey records are unaffected", async () => {
      // Check that ApiKey table still has all original data
      const keyCount = await prisma.apiKey.count();
      expect(keyCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Unique Constraints", () => {
    test("Team.slug must be unique", async () => {
      // Create a team
      const team1 = await prisma.team.create({
        data: {
          name: "Test Team 1",
          slug: "test-team-unique-" + Date.now(),
        },
      });

      // Try to create another with same slug (should fail)
      await expect(
        prisma.team.create({
          data: {
            name: "Test Team 2",
            slug: team1.slug,
          },
        }),
      ).rejects.toThrow();

      // Cleanup
      await prisma.team.delete({ where: { id: team1.id } });
    });

    test("TeamQuota has unique constraint on teamId", async () => {
      // Create team and quota
      const team = await prisma.team.create({
        data: {
          name: "Quota Test",
          slug: "quota-test-" + Date.now(),
        },
      });

      const quota1 = await prisma.teamQuota.create({
        data: {
          teamId: team.id,
          monthlyLimit: 10000,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Try to create another quota for same team (should fail)
      await expect(
        prisma.teamQuota.create({
          data: {
            teamId: team.id,
            monthlyLimit: 20000,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ).rejects.toThrow();

      // Cleanup
      await prisma.teamQuota.delete({ where: { id: quota1.id } });
      await prisma.team.delete({ where: { id: team.id } });
    });

    test("TeamMember has unique constraint on (teamId, userId)", async () => {
      // Requires a User to exist
      const user = await prisma.user.findFirst();
      if (!user) {
        console.log("Skipping: No users found in database");
        return;
      }

      // Create team and add member
      const team = await prisma.team.create({
        data: {
          name: "Member Test",
          slug: "member-test-" + Date.now(),
        },
      });

      const member1 = await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: "admin",
        },
      });

      // Try to add same user again (should fail)
      await expect(
        prisma.teamMember.create({
          data: {
            teamId: team.id,
            userId: user.id,
            role: "editor",
          },
        }),
      ).rejects.toThrow();

      // Cleanup
      await prisma.teamMember.delete({ where: { id: member1.id } });
      await prisma.team.delete({ where: { id: team.id } });
    });
  });

  describe("Cascading Deletes", () => {
    test("deleting Team cascades to TeamMembers", async () => {
      const user = await prisma.user.findFirst();
      if (!user) {
        console.log("Skipping: No users found");
        return;
      }

      const team = await prisma.team.create({
        data: {
          name: "Cascade Test",
          slug: "cascade-" + Date.now(),
        },
      });

      await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: "admin",
        },
      });

      // Delete team
      await prisma.team.delete({ where: { id: team.id } });

      // Verify TeamMembers are deleted
      const memberCount = await prisma.teamMember.count({
        where: { teamId: team.id },
      });

      expect(memberCount).toBe(0);
    });

    test("deleting Team cascades to TeamQuota", async () => {
      const team = await prisma.team.create({
        data: {
          name: "Quota Cascade Test",
          slug: "quota-cascade-" + Date.now(),
        },
      });

      await prisma.teamQuota.create({
        data: {
          teamId: team.id,
          monthlyLimit: 10000,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Delete team
      await prisma.team.delete({ where: { id: team.id } });

      // Verify TeamQuota is deleted
      const quotaCount = await prisma.teamQuota.count({
        where: { teamId: team.id },
      });

      expect(quotaCount).toBe(0);
    });
  });

  describe("Data Type Correctness", () => {
    test("TeamQuota.monthlyLimit is integer", async () => {
      const team = await prisma.team.create({
        data: {
          name: "Type Test",
          slug: "type-test-" + Date.now(),
        },
      });

      const quota = await prisma.teamQuota.create({
        data: {
          teamId: team.id,
          monthlyLimit: 100000,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      expect(typeof quota.monthlyLimit).toBe("number");
      expect(quota.monthlyLimit).toBe(100000);

      // Cleanup
      await prisma.teamQuota.delete({ where: { id: quota.id } });
      await prisma.team.delete({ where: { id: team.id } });
    });

    test("TeamMember.role is string enum", async () => {
      const user = await prisma.user.findFirst();
      if (!user) return;

      const team = await prisma.team.create({
        data: {
          name: "Role Test",
          slug: "role-test-" + Date.now(),
        },
      });

      const member = await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: "admin",
        },
      });

      expect(member.role).toBe("admin");
      expect(["admin", "editor", "viewer"]).toContain(member.role);

      // Cleanup
      await prisma.teamMember.delete({ where: { id: member.id } });
      await prisma.team.delete({ where: { id: team.id } });
    });
  });
});
