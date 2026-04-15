const { ToolOptimizer } = require("../src/optimizer");

describe("ToolOptimizer", () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new ToolOptimizer();
  });

  describe("recordToolCall", () => {
    it("should record a tool call", () => {
      optimizer.recordToolCall("Read", { file: "src/auth.js" });
      expect(optimizer.totalCalls).toBe(1);
    });

    it("should track calls by type", () => {
      optimizer.recordToolCall("Read", { file: "a.js" });
      optimizer.recordToolCall("Read", { file: "b.js" });
      optimizer.recordToolCall("Bash", { cmd: "npm test" });
      expect(optimizer.callsByType("Read")).toBe(2);
      expect(optimizer.callsByType("Bash")).toBe(1);
    });
  });

  describe("detectPatterns", () => {
    it("should detect sequential single-file reads", () => {
      optimizer.recordToolCall("Read", { file: "a.js" });
      optimizer.recordToolCall("Read", { file: "b.js" });
      optimizer.recordToolCall("Read", { file: "c.js" });
      const patterns = optimizer.detectPatterns();
      expect(patterns.some((p) => p.type === "sequential_reads")).toBe(true);
    });

    it("should detect full-file reads on large files", () => {
      optimizer.recordToolCall("Read", { file: "big.js", lines: 500, fullFile: true });
      const patterns = optimizer.detectPatterns();
      expect(patterns.some((p) => p.type === "large_full_read")).toBe(true);
    });

    it("should detect repeated grep patterns", () => {
      optimizer.recordToolCall("Grep", { pattern: "TODO" });
      optimizer.recordToolCall("Grep", { pattern: "TODO" });
      const patterns = optimizer.detectPatterns();
      expect(patterns.some((p) => p.type === "repeated_search")).toBe(true);
    });

    it("should return empty for optimal usage", () => {
      optimizer.recordToolCall("Read", { file: "a.js", lines: 30, fullFile: false });
      const patterns = optimizer.detectPatterns();
      expect(patterns.length).toBe(0);
    });
  });

  describe("suggestions", () => {
    it("should suggest batching for sequential reads", () => {
      optimizer.recordToolCall("Read", { file: "a.js" });
      optimizer.recordToolCall("Read", { file: "b.js" });
      optimizer.recordToolCall("Read", { file: "c.js" });
      optimizer.recordToolCall("Read", { file: "d.js" });
      const sug = optimizer.suggestions();
      expect(sug.length).toBeGreaterThan(0);
    });

    it("should suggest line ranges for large file reads", () => {
      optimizer.recordToolCall("Read", { file: "big.js", lines: 500, fullFile: true });
      const sug = optimizer.suggestions();
      expect(sug.some((s) => s.includes("line range") || s.includes("offset"))).toBe(true);
    });
  });

  describe("efficiency", () => {
    it("should return 100% when no waste detected", () => {
      optimizer.recordToolCall("Read", { file: "a.js", lines: 30, fullFile: false });
      expect(optimizer.efficiency()).toBe(100);
    });

    it("should decrease with wasteful patterns", () => {
      optimizer.recordToolCall("Read", { file: "big.js", lines: 500, fullFile: true });
      optimizer.recordToolCall("Read", { file: "big2.js", lines: 400, fullFile: true });
      optimizer.recordToolCall("Grep", { pattern: "foo" });
      optimizer.recordToolCall("Grep", { pattern: "foo" });
      expect(optimizer.efficiency()).toBeLessThan(100);
    });
  });

  describe("reset", () => {
    it("should clear all tracking", () => {
      optimizer.recordToolCall("Read", { file: "a.js" });
      optimizer.reset();
      expect(optimizer.totalCalls).toBe(0);
    });
  });
});
