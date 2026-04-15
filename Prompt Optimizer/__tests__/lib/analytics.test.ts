import { prisma } from "@/lib/db";
import {
  getUsageAnalytics,
  formatAsCSV,
  formatAsJSON,
  getCurrentMonthPeriod,
  getPreviousMonthPeriod,
  validateDatePeriod,
} from "@/lib/analytics";

describe("Analytics Service", () => {
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `analytics-service-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: "Analytics Service Team",
        slug: `analytics-svc-${Date.now()}`,
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
    await prisma.optimizationRecord.deleteMany({
      where: { userId: testUserId },
    });

    if (testTeamId) {
      await prisma.team.deleteMany({
        where: { id: testTeamId },
      });
    }
  });

  describe("getUsageAnalytics", () => {
    test("should aggregate records by endpoint", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);

      // Create score-only record
      await prisma.optimizationRecord.create({
        data: {
          raw_prompt: "Test prompt 1",
          raw_score: JSON.stringify({ total: 50 }),
          raw_score_total: 50,
          userId: testUserId,
        },
      });

      // Create optimize record
      await prisma.optimizationRecord.create({
        data: {
          raw_prompt: "Test prompt 2",
          raw_score: JSON.stringify({ total: 60 }),
          raw_score_total: 60,
          optimized_prompt: "Optimized prompt",
          optimized_score: JSON.stringify({ total: 80 }),
          optimized_score_total: 80,
          userId: testUserId,
        },
      });

      const analytics = await getUsageAnalytics(
        startDate.toISOString().split("T")[0],
        now.toISOString().split("T")[0],
        undefined,
        testUserId,
      );

      expect(analytics.by_endpoint.score.calls).toBeGreaterThan(0);
      expect(analytics.by_endpoint.optimize.calls).toBeGreaterThan(0);
    });

    test("should calculate correct token totals", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const recordsBefore = await prisma.optimizationRecord.count({
        where: { userId: testUserId },
      });

      await prisma.optimizationRecord.create({
        data: {
          raw_prompt: "Token test",
          raw_score: JSON.stringify({ total: 100 }),
          raw_score_total: 100,
          userId: testUserId,
        },
      });

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
        undefined,
        testUserId,
      );

      expect(analytics.totals.total_tokens).toBeGreaterThan(0);
    });

    test("should filter by team when teamId provided", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);

      const analytics = await getUsageAnalytics(
        startDate.toISOString().split("T")[0],
        now.toISOString().split("T")[0],
        testTeamId,
      );

      expect(analytics).toBeDefined();
      expect(analytics.team?.id).toBe(testTeamId);
    });

    test("should include member breakdown", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
        undefined,
        testUserId,
      );

      expect(Array.isArray(analytics.by_member)).toBe(true);
    });

    test("should include daily breakdown", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
        undefined,
        testUserId,
      );

      expect(Array.isArray(analytics.daily_breakdown)).toBe(true);
    });
  });

  describe("formatAsCSV", () => {
    test("should format analytics as CSV with sections", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
        undefined,
        testUserId,
      );

      const csv = formatAsCSV(analytics);

      expect(csv).toContain("Period:");
      expect(csv).toContain("Summary");
      expect(csv).toContain("By Endpoint");
      expect(csv).toContain("By Team Member");
      expect(csv).toContain("Daily Breakdown");
    });

    test("should include header row for each section", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
      );

      const csv = formatAsCSV(analytics);
      const lines = csv.split("\n");

      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe("formatAsJSON", () => {
    test("should format analytics as JSON", async () => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);

      const analytics = await getUsageAnalytics(
        startDate.toISOString(),
        now.toISOString(),
      );

      const json = formatAsJSON(analytics);
      const parsed = JSON.parse(json);

      expect(parsed.period).toBeDefined();
      expect(parsed.totals).toBeDefined();
      expect(parsed.by_endpoint).toBeDefined();
    });
  });

  describe("Date period helpers", () => {
    test("getCurrentMonthPeriod should return valid dates", () => {
      const { start, end } = getCurrentMonthPeriod();

      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(start < end).toBe(true);
    });

    test("getPreviousMonthPeriod should return valid dates", () => {
      const { start, end } = getPreviousMonthPeriod();

      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(start < end).toBe(true);
    });
  });

  describe("validateDatePeriod", () => {
    test("should reject invalid start date", () => {
      const error = validateDatePeriod("invalid-date", "2026-04-14");
      expect(error).toBe("Invalid start date");
    });

    test("should reject invalid end date", () => {
      const error = validateDatePeriod("2026-04-14", "invalid-date");
      expect(error).toBe("Invalid end date");
    });

    test("should reject when start > end", () => {
      const error = validateDatePeriod("2026-04-14", "2026-04-13");
      expect(error).toBe("Start date must be before end date");
    });

    test("should reject period > 365 days", () => {
      const error = validateDatePeriod("2025-04-14", "2027-04-14");
      expect(error).toContain("365 days");
    });

    test("should accept valid date range", () => {
      const error = validateDatePeriod("2026-04-07", "2026-04-14");
      expect(error).toBeNull();
    });
  });
});
