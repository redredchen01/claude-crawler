import { prisma } from "@/lib/db";
import {
  createTeam,
  getTeamById,
  listUserTeams,
  addTeamMember,
  removeTeamMember,
  updateTeamQuota,
  incrementTeamQuotaUsage,
  getTeamQuota,
} from "@/lib/teams";

describe("Team Service", () => {
  let testTeamId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Get or create a test user
    let user = await prisma.user.findFirst();
    if (!user) {
      // Create a test user if none exists
      user = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test teams
    if (testTeamId) {
      await prisma.team.deleteMany({
        where: {
          slug: { startsWith: "test-team-" },
        },
      });
    }
  });

  describe("createTeam", () => {
    test("should create team with valid data", async () => {
      const team = await createTeam(
        testUserId,
        "Test Team",
        `test-team-${Date.now()}`,
      );

      expect(team).toBeDefined();
      expect(team.name).toBe("Test Team");
      expect(team.slug).toMatch(/^test-team-/);

      testTeamId = team.id;
    });

    test("should make creator an admin member", async () => {
      const team = await createTeam(
        testUserId,
        "Admin Test",
        `admin-test-${Date.now()}`,
      );
      const members = await prisma.teamMember.findMany({
        where: { teamId: team.id },
      });

      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(testUserId);
      expect(members[0].role).toBe("admin");

      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should initialize team quota", async () => {
      const team = await createTeam(
        testUserId,
        "Quota Test",
        `quota-test-${Date.now()}`,
      );
      const quota = await prisma.teamQuota.findUnique({
        where: { teamId: team.id },
      });

      expect(quota).toBeDefined();
      expect(quota?.monthlyLimit).toBeGreaterThan(0);
      expect(quota?.currentUsage).toBe(0);

      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should reject duplicate slug", async () => {
      const slug = `unique-${Date.now()}`;
      await createTeam(testUserId, "Team 1", slug);

      await expect(createTeam(testUserId, "Team 2", slug)).rejects.toThrow();

      await prisma.team.deleteMany({ where: { slug } });
    });
  });

  describe("getTeamById", () => {
    test("should return team if user is member", async () => {
      const team = await createTeam(
        testUserId,
        "Member Test",
        `member-test-${Date.now()}`,
      );
      const retrieved = await getTeamById(team.id, testUserId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(team.id);
      expect(retrieved?.name).toBe("Member Test");

      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should return null if user is not member", async () => {
      const team = await createTeam(
        testUserId,
        "Not Member",
        `not-member-${Date.now()}`,
      );
      const otherUser = await prisma.user.findFirst({
        where: { id: { not: testUserId } },
      });

      if (otherUser) {
        const retrieved = await getTeamById(team.id, otherUser.id);
        expect(retrieved).toBeNull();
      }

      await prisma.team.delete({ where: { id: team.id } });
    });
  });

  describe("listUserTeams", () => {
    test("should return all teams user is member of", async () => {
      const team1 = await createTeam(
        testUserId,
        "Team 1",
        `team1-${Date.now()}`,
      );
      const team2 = await createTeam(
        testUserId,
        "Team 2",
        `team2-${Date.now()}`,
      );

      const teams = await listUserTeams(testUserId);
      const ids = teams.map((t) => t.id);

      expect(ids).toContain(team1.id);
      expect(ids).toContain(team2.id);

      await prisma.team.deleteMany({
        where: { id: { in: [team1.id, team2.id] } },
      });
    });

    test("should return empty array if user has no teams", async () => {
      const newUser = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const teams = await listUserTeams(newUser.id);
      expect(teams).toHaveLength(0);

      await prisma.user.delete({ where: { id: newUser.id } });
    });
  });

  describe("addTeamMember", () => {
    test("should add member with specified role", async () => {
      const team = await createTeam(
        testUserId,
        "Add Member",
        `add-member-${Date.now()}`,
      );
      const newUser = await prisma.user.create({
        data: {
          email: `member-${Date.now()}@example.com`,
          password: "hashed",
        },
      });

      await addTeamMember(team.id, testUserId, newUser.id, "editor");

      const members = await prisma.teamMember.findMany({
        where: { teamId: team.id },
      });

      expect(members).toHaveLength(2);
      const added = members.find((m) => m.userId === newUser.id);
      expect(added?.role).toBe("editor");

      await prisma.team.delete({ where: { id: team.id } });
      await prisma.user.delete({ where: { id: newUser.id } });
    });

    test("should reject if requester is not admin", async () => {
      const team = await createTeam(
        testUserId,
        "No Permission",
        `no-perm-${Date.now()}`,
      );
      const viewer = await prisma.user.create({
        data: {
          email: `viewer-${Date.now()}@example.com`,
          password: "hashed",
        },
      });
      const target = await prisma.user.create({
        data: {
          email: `target-${Date.now()}@example.com`,
          password: "hashed",
        },
      });

      await addTeamMember(team.id, testUserId, viewer.id, "viewer");

      await expect(
        addTeamMember(team.id, viewer.id, target.id, "editor"),
      ).rejects.toThrow();

      await prisma.team.delete({ where: { id: team.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [viewer.id, target.id] } },
      });
    });
  });

  describe("removeTeamMember", () => {
    test("should remove member from team", async () => {
      const team = await createTeam(
        testUserId,
        "Remove Test",
        `remove-test-${Date.now()}`,
      );
      const member = await prisma.user.create({
        data: {
          email: `member2-${Date.now()}@example.com`,
          password: "hashed",
        },
      });

      await addTeamMember(team.id, testUserId, member.id, "editor");
      await removeTeamMember(team.id, testUserId, member.id);

      const members = await prisma.teamMember.findMany({
        where: { teamId: team.id },
      });

      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(testUserId);

      await prisma.team.delete({ where: { id: team.id } });
      await prisma.user.delete({ where: { id: member.id } });
    });

    test("should prevent removing last admin", async () => {
      const team = await createTeam(
        testUserId,
        "Last Admin",
        `last-admin-${Date.now()}`,
      );

      await expect(
        removeTeamMember(team.id, testUserId, testUserId),
      ).rejects.toThrow();

      await prisma.team.delete({ where: { id: team.id } });
    });
  });

  describe("Team Quota Management", () => {
    test("should increment quota usage", async () => {
      const team = await createTeam(
        testUserId,
        "Quota Inc",
        `quota-inc-${Date.now()}`,
      );

      await incrementTeamQuotaUsage(team.id, 100);
      let quota = await getTeamQuota(team.id);
      expect(quota.currentUsage).toBe(100);

      await incrementTeamQuotaUsage(team.id, 50);
      quota = await getTeamQuota(team.id);
      expect(quota.currentUsage).toBe(150);

      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should update monthly limit", async () => {
      const team = await createTeam(
        testUserId,
        "Quota Update",
        `quota-update-${Date.now()}`,
      );

      await updateTeamQuota(team.id, testUserId, 50000);
      const quota = await getTeamQuota(team.id);

      expect(quota.monthlyLimit).toBe(50000);

      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should prevent non-admin from updating quota", async () => {
      const team = await createTeam(
        testUserId,
        "No Quota Perm",
        `no-quota-${Date.now()}`,
      );
      const editor = await prisma.user.create({
        data: {
          email: `editor-${Date.now()}@example.com`,
          password: "hashed",
        },
      });

      await addTeamMember(team.id, testUserId, editor.id, "editor");

      await expect(
        updateTeamQuota(team.id, editor.id, 50000),
      ).rejects.toThrow();

      await prisma.team.delete({ where: { id: team.id } });
      await prisma.user.delete({ where: { id: editor.id } });
    });
  });
});
