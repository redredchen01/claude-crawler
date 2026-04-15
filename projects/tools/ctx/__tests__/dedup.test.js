const { FileReadTracker } = require("../src/dedup");

describe("FileReadTracker", () => {
  let tracker;

  beforeEach(() => {
    tracker = new FileReadTracker();
  });

  describe("record", () => {
    it("should record a file read", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      expect(tracker.has("src/auth.js")).toBe(true);
    });

    it("should record line range reads", () => {
      tracker.record("src/auth.js", { lines: 50, range: [10, 60] });
      expect(tracker.has("src/auth.js")).toBe(true);
    });

    it("should track read count per file", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.record("src/auth.js", { lines: 100, range: null });
      expect(tracker.readCount("src/auth.js")).toBe(2);
    });

    it("should track total lines read", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.record("src/index.js", { lines: 50, range: null });
      expect(tracker.totalLinesRead).toBe(150);
    });
  });

  describe("isDuplicate", () => {
    it("should detect full re-read of already-read file", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      expect(tracker.isDuplicate("src/auth.js", { range: null })).toBe(true);
    });

    it("should NOT flag first read as duplicate", () => {
      expect(tracker.isDuplicate("src/auth.js", { range: null })).toBe(false);
    });

    it("should detect range re-read within already-read range", () => {
      tracker.record("src/auth.js", { lines: 100, range: null }); // full read
      expect(tracker.isDuplicate("src/auth.js", { range: [10, 30] })).toBe(true);
    });

    it("should NOT flag new range outside previous reads", () => {
      tracker.record("src/auth.js", { lines: 50, range: [1, 50] });
      expect(tracker.isDuplicate("src/auth.js", { range: [80, 100] })).toBe(false);
    });

    it("should detect overlapping range reads", () => {
      tracker.record("src/auth.js", { lines: 50, range: [1, 50] });
      // 10-30 is fully within 1-50
      expect(tracker.isDuplicate("src/auth.js", { range: [10, 30] })).toBe(true);
    });
  });

  describe("wastedTokens", () => {
    it("should be 0 when no duplicates", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.record("src/index.js", { lines: 50, range: null });
      expect(tracker.wastedTokens).toBe(0);
    });

    it("should calculate wasted tokens on duplicate reads", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.recordDuplicate("src/auth.js", { lines: 100 });
      // 100 lines × 15 tokens/line = 1500 wasted
      expect(tracker.wastedTokens).toBe(1500);
    });

    it("should accumulate multiple duplicate reads", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.recordDuplicate("src/auth.js", { lines: 100 });
      tracker.recordDuplicate("src/auth.js", { lines: 100 });
      expect(tracker.wastedTokens).toBe(3000);
    });
  });

  describe("suggestion", () => {
    it("should suggest line range when file was fully read before", () => {
      tracker.record("src/auth.js", { lines: 200, range: null });
      const sug = tracker.suggestion("src/auth.js");
      expect(sug).toContain("already read");
    });

    it("should return null for unread files", () => {
      expect(tracker.suggestion("src/new.js")).toBeNull();
    });
  });

  describe("summary", () => {
    it("should return file count and stats", () => {
      tracker.record("a.js", { lines: 100, range: null });
      tracker.record("b.js", { lines: 50, range: null });
      tracker.recordDuplicate("a.js", { lines: 100 }); // record + mark wasted

      const summary = tracker.summary();
      expect(summary.filesRead).toBe(2);
      expect(summary.totalReads).toBe(3); // 2 normal + 1 duplicate
      expect(summary.duplicateReads).toBe(1);
      expect(summary.wastedTokens).toBe(1500);
    });
  });

  describe("toTable", () => {
    it("should format as markdown table", () => {
      tracker.record("src/auth.js", { lines: 100, range: null });
      tracker.record("src/index.js", { lines: 50, range: [1, 50] });
      const table = tracker.toTable();
      expect(table).toContain("src/auth.js");
      expect(table).toContain("src/index.js");
      expect(table).toContain("|");
    });

    it("should be empty string when no reads", () => {
      expect(tracker.toTable()).toBe("");
    });
  });

  describe("reset", () => {
    it("should clear all tracking", () => {
      tracker.record("a.js", { lines: 100, range: null });
      tracker.reset();
      expect(tracker.has("a.js")).toBe(false);
      expect(tracker.totalLinesRead).toBe(0);
    });
  });
});
