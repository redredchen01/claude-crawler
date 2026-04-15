import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/db";
import * as fs from "fs";

jest.mock("@/lib/db", () => ({
  prisma: {
    optimizationRecord: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Rate Limiting Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env vars to defaults
    delete process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR;
    delete process.env.RATE_LIMIT_SCORE_PER_HOUR;
  });

  describe("checkRateLimit - optimize-full endpoint", () => {
    it("should return allowed=true when under limit", async () => {
      mockPrisma.optimizationRecord.count.mockResolvedValue(5);
      mockPrisma.optimizationRecord.findFirst.mockResolvedValue({
        created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      });

      const result = await checkRateLimit("user-1", "optimize-full");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // 10 - 5
      expect(result.limit).toBe(10);
    });

    it("should return allowed=false when at or exceeding limit", async () => {
      mockPrisma.optimizationRecord.count.mockResolvedValue(10);
      mockPrisma.optimizationRecord.findFirst.mockResolvedValue({
        created_at: new Date(Date.now() - 30 * 60 * 1000),
      });

      const result = await checkRateLimit("user-1", "optimize-full");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should count only records within 1-hour window", async () => {
      mockPrisma.optimizationRecord.count.mockResolvedValue(3);

      await checkRateLimit("user-1", "optimize-full");

      expect(mockPrisma.optimizationRecord.count).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          created_at: {
            gt: expect.any(Date),
          },
        },
      });

      // Verify the timestamp is approximately 1 hour ago
      const callArgs = mockPrisma.optimizationRecord.count.mock.calls[0][0];
      const cutoffTime = callArgs.where.created_at.gt;
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeDiff = Math.abs(cutoffTime.getTime() - oneHourAgo.getTime());
      expect(timeDiff).toBeLessThan(5000); // within 5 seconds
    });

    it("should return correct remaining count", async () => {
      mockPrisma.optimizationRecord.count.mockResolvedValue(3);
      mockPrisma.optimizationRecord.findFirst.mockResolvedValue({
        created_at: new Date(Date.now() - 30 * 60 * 1000),
      });

      const result = await checkRateLimit("user-1", "optimize-full");

      expect(result.remaining).toBe(7); // 10 - 3
    });

    it("should return resetAt as oldest record + 1 hour", async () => {
      mockPrisma.optimizationRecord.count.mockResolvedValue(2);
      mockPrisma.optimizationRecord.findFirst.mockResolvedValue({
        created_at: new Date(Date.now() - 30 * 60 * 1000),
      });

      const result = await checkRateLimit("user-1", "optimize-full");

      expect(result.resetAt).toBeInstanceOf(Date);
      // resetAt should be in the future (approximately 1 hour from now if oldest record is now)
      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should use env-configured limit for optimize-full", async () => {
      process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR = "20";
      mockPrisma.optimizationRecord.count.mockResolvedValue(15);
      mockPrisma.optimizationRecord.findFirst.mockResolvedValue({
        created_at: new Date(Date.now() - 30 * 60 * 1000),
      });

      const result = await checkRateLimit("user-1", "optimize-full");

      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(5); // 20 - 15
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkRateLimit - score endpoint", () => {
    it("should return allowed=true when under limit (in-memory)", async () => {
      const result = await checkRateLimit("user-1", "score");

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(30);
      // First call has remaining = limit
      expect(result.remaining).toBe(30);
    });

    it("should use env-configured limit for score", async () => {
      process.env.RATE_LIMIT_SCORE_PER_HOUR = "50";

      const result = await checkRateLimit("user-1", "score");

      expect(result.limit).toBe(50);
    });

    it("should track multiple calls and decrement remaining", async () => {
      const result1 = await checkRateLimit("user-2", "score");
      expect(result1.remaining).toBe(30);

      const result2 = await checkRateLimit("user-2", "score");
      expect(result2.remaining).toBe(29); // Decremented

      const result3 = await checkRateLimit("user-2", "score");
      expect(result3.remaining).toBe(28);
    });

    it("should isolate rate limits per user", async () => {
      const result1 = await checkRateLimit("user-a", "score");
      const result2 = await checkRateLimit("user-b", "score");

      // Both should have fresh limits (not affected by each other)
      expect(result1.remaining).toBe(30);
      expect(result2.remaining).toBe(30);
    });
  });
});
