const { Formatter } = require("../src/formatter");

describe("Formatter", () => {
  describe("statusBar", () => {
    it("should format green status", () => {
      const bar = Formatter.statusBar({
        percentage: 20,
        threshold: "green",
        reads: 5,
        writes: 3,
      });
      expect(bar).toContain("20%");
      expect(bar).toContain("5r");
      expect(bar).toContain("3w");
    });

    it("should include emoji indicator", () => {
      expect(Formatter.statusBar({ percentage: 20, threshold: "green", reads: 0, writes: 0 })).toMatch(/🟢/);
      expect(Formatter.statusBar({ percentage: 45, threshold: "yellow", reads: 0, writes: 0 })).toMatch(/🟡/);
      expect(Formatter.statusBar({ percentage: 65, threshold: "orange", reads: 0, writes: 0 })).toMatch(/🟠/);
      expect(Formatter.statusBar({ percentage: 85, threshold: "red", reads: 0, writes: 0 })).toMatch(/🔴/);
    });

    it("should be under 80 characters", () => {
      const bar = Formatter.statusBar({
        percentage: 75,
        threshold: "orange",
        reads: 99,
        writes: 99,
      });
      expect(bar.length).toBeLessThanOrEqual(80);
    });
  });

  describe("checkpointReport", () => {
    it("should format a checkpoint report", () => {
      const report = Formatter.checkpointReport({
        percentage: 50,
        threshold: "yellow",
        summary: "Auth module refactor",
        saved: 2,
        recommendations: ["Use line ranges for reads"],
      });
      expect(report).toContain("50%");
      expect(report).toContain("Auth module refactor");
    });

    it("should include recommendations when present", () => {
      const report = Formatter.checkpointReport({
        percentage: 75,
        threshold: "orange",
        summary: "test",
        saved: 1,
        recommendations: ["Start a new session", "Save important context"],
      });
      expect(report).toContain("Start a new session");
    });
  });

  describe("healthScore", () => {
    it("should return score 0-10", () => {
      const score = Formatter.healthScore({
        fileCount: 4,
        staleCount: 0,
        needsCompression: 0,
        lastUpdated: new Date().toISOString(),
      });
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(10);
    });

    it("should penalize too many files", () => {
      const good = Formatter.healthScore({ fileCount: 4, staleCount: 0, needsCompression: 0, lastUpdated: new Date().toISOString() });
      const bad = Formatter.healthScore({ fileCount: 15, staleCount: 0, needsCompression: 0, lastUpdated: new Date().toISOString() });
      expect(good.score).toBeGreaterThan(bad.score);
    });

    it("should penalize stale files", () => {
      const good = Formatter.healthScore({ fileCount: 4, staleCount: 0, needsCompression: 0, lastUpdated: new Date().toISOString() });
      const bad = Formatter.healthScore({ fileCount: 4, staleCount: 3, needsCompression: 0, lastUpdated: new Date().toISOString() });
      expect(good.score).toBeGreaterThan(bad.score);
    });

    it("should return formatted display string", () => {
      const result = Formatter.healthScore({ fileCount: 4, staleCount: 0, needsCompression: 1, lastUpdated: new Date().toISOString() });
      expect(result.display).toBeTruthy();
      expect(typeof result.display).toBe("string");
    });
  });
});
