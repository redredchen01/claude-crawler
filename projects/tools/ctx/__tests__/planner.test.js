const { TaskPlanner } = require("../src/planner");

describe("TaskPlanner", () => {
  let planner;

  beforeEach(() => {
    planner = new TaskPlanner({ maxTokens: 200_000, usedTokens: 60_000 });
  });

  describe("estimate", () => {
    it("should estimate tokens for a single-file task", () => {
      const est = planner.estimate({
        filesToRead: [{ path: "src/auth.js", lines: 100 }],
        expectedResponses: 3,
        expectedToolCalls: 5,
      });
      expect(est.totalTokens).toBeGreaterThan(0);
      expect(est).toHaveProperty("breakdown");
    });

    it("should estimate tokens for a multi-file task", () => {
      const est = planner.estimate({
        filesToRead: [
          { path: "src/auth.js", lines: 200 },
          { path: "src/middleware.js", lines: 150 },
          { path: "src/routes.js", lines: 300 },
        ],
        expectedResponses: 10,
        expectedToolCalls: 20,
      });
      expect(est.totalTokens).toBeGreaterThan(10000);
    });

    it("should include breakdown by category", () => {
      const est = planner.estimate({
        filesToRead: [{ path: "a.js", lines: 100 }],
        expectedResponses: 5,
        expectedToolCalls: 10,
      });
      expect(est.breakdown).toHaveProperty("fileReads");
      expect(est.breakdown).toHaveProperty("responses");
      expect(est.breakdown).toHaveProperty("toolCalls");
    });
  });

  describe("fits", () => {
    it("should return true when task fits in remaining context", () => {
      const est = planner.estimate({
        filesToRead: [{ path: "a.js", lines: 50 }],
        expectedResponses: 2,
        expectedToolCalls: 3,
      });
      expect(planner.fits(est)).toBe(true);
    });

    it("should return false when task exceeds remaining context", () => {
      const bigPlanner = new TaskPlanner({ maxTokens: 200_000, usedTokens: 190_000 });
      const est = bigPlanner.estimate({
        filesToRead: [
          { path: "a.js", lines: 500 },
          { path: "b.js", lines: 500 },
        ],
        expectedResponses: 20,
        expectedToolCalls: 30,
      });
      expect(bigPlanner.fits(est)).toBe(false);
    });
  });

  describe("suggest", () => {
    it("should suggest splitting when task is too large", () => {
      const tightPlanner = new TaskPlanner({ maxTokens: 200_000, usedTokens: 180_000 });
      const est = tightPlanner.estimate({
        filesToRead: [
          { path: "a.js", lines: 300 },
          { path: "b.js", lines: 300 },
          { path: "c.js", lines: 300 },
        ],
        expectedResponses: 15,
        expectedToolCalls: 25,
      });
      const suggestions = tightPlanner.suggest(est);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes("split") || s.includes("critical"))).toBe(true);
    });

    it("should return empty when task fits comfortably", () => {
      const est = planner.estimate({
        filesToRead: [{ path: "a.js", lines: 30 }],
        expectedResponses: 2,
        expectedToolCalls: 3,
      });
      expect(planner.suggest(est)).toEqual([]);
    });
  });

  describe("remainingTokens", () => {
    it("should calculate remaining tokens", () => {
      expect(planner.remainingTokens).toBe(140_000);
    });
  });

  describe("formatReport", () => {
    it("should produce a readable report", () => {
      const est = planner.estimate({
        filesToRead: [{ path: "src/auth.js", lines: 100 }],
        expectedResponses: 5,
        expectedToolCalls: 8,
      });
      const report = planner.formatReport(est);
      expect(report).toContain("auth.js");
      expect(report).toContain("remaining");
    });
  });
});
