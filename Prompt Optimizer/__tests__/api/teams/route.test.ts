import {
  POST as createTeamHandler,
  GET as listTeamsHandler,
} from "@/app/api/teams/route";
import { POST as getTeamHandler } from "@/app/api/teams/[id]/route";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

// Mock requireAuth
jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
}));

import { requireAuth } from "@/lib/rbac";

describe("Team API Endpoints", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Mock requireAuth
    (requireAuth as jest.Mock).mockResolvedValue({
      user: { id: testUserId },
    });
  });

  describe("POST /api/teams", () => {
    test("should create team successfully", async () => {
      const request = new NextRequest("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Team",
          slug: `test-team-${Date.now()}`,
        }),
      });

      const response = await createTeamHandler(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.name).toBe("Test Team");
      expect(data.slug).toContain("test-team-");

      // Cleanup
      await prisma.team.delete({ where: { id: data.id } });
    });

    test("should reject invalid team name", async () => {
      const request = new NextRequest("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "",
          slug: "invalid",
        }),
      });

      const response = await createTeamHandler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Team name");
    });

    test("should reject invalid slug format", async () => {
      const request = new NextRequest("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          slug: "INVALID_SLUG!",
        }),
      });

      const response = await createTeamHandler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("slug");
    });

    test("should reject duplicate slug", async () => {
      const slug = `unique-${Date.now()}`;

      // Create first team
      const request1 = new NextRequest("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Team 1",
          slug,
        }),
      });

      const response1 = await createTeamHandler(request1);
      const team1 = await response1.json();

      // Try to create second with same slug
      const request2 = new NextRequest("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Team 2",
          slug,
        }),
      });

      const response2 = await createTeamHandler(request2);
      expect(response2.status).toBe(409);

      // Cleanup
      await prisma.team.delete({ where: { id: team1.id } });
    });
  });

  describe("GET /api/teams", () => {
    test("should list user teams", async () => {
      // Create a test team
      const team = await prisma.team.create({
        data: {
          name: "List Test",
          slug: `list-test-${Date.now()}`,
        },
      });

      await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: testUserId,
          role: "admin",
        },
      });

      const request = new NextRequest("http://localhost:3000/api/teams", {
        method: "GET",
      });

      const response = await listTeamsHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.teams).toBeDefined();
      expect(Array.isArray(data.teams)).toBe(true);
      expect(data.count).toBeGreaterThan(0);

      // Cleanup
      await prisma.team.delete({ where: { id: team.id } });
    });

    test("should return empty array if user has no teams", async () => {
      // Create user with no teams
      const newUser = await prisma.user.create({
        data: {
          email: `no-teams-${Date.now()}@example.com`,
          password: "hashed",
        },
      });

      (requireAuth as jest.Mock).mockResolvedValueOnce({
        user: { id: newUser.id },
      });

      const request = new NextRequest("http://localhost:3000/api/teams", {
        method: "GET",
      });

      const response = await listTeamsHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.teams).toHaveLength(0);
      expect(data.count).toBe(0);

      // Cleanup
      await prisma.user.delete({ where: { id: newUser.id } });
    });
  });
});
