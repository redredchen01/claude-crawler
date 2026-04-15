const { CheckpointManager } = require("../src/checkpoint");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("CheckpointManager", () => {
  let tmpDir;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-cp-"));
    manager = new CheckpointManager({ dir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("save", () => {
    it("should create a checkpoint file", () => {
      manager.save({
        percentage: 45,
        threshold: "yellow",
        summary: "Working on auth module",
        keyFiles: ["src/auth.js", "src/middleware.js"],
        decisions: ["Use JWT over sessions"],
      });

      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^ctx-checkpoint-/);
    });

    it("should write valid markdown with frontmatter", () => {
      manager.save({
        percentage: 45,
        threshold: "yellow",
        summary: "Working on auth module",
        keyFiles: [],
        decisions: [],
      });

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("type: checkpoint");
      expect(content).toContain("percentage: 45");
    });

    it("should include timestamp in filename", () => {
      manager.save({ percentage: 50, threshold: "yellow", summary: "test", keyFiles: [], decisions: [] });
      const files = fs.readdirSync(tmpDir);
      // Format: ctx-checkpoint-YYYYMMDD-HHmmss-NNN.md
      expect(files[0]).toMatch(/ctx-checkpoint-\d{8}-\d{6}-\d{3}\.md/);
    });

    it("should keep checkpoint under 50 lines", () => {
      manager.save({
        percentage: 75,
        threshold: "orange",
        summary: "A".repeat(1000),
        keyFiles: Array(20).fill("file.js"),
        decisions: Array(20).fill("decision"),
      });

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      const lines = content.split("\n").length;
      expect(lines).toBeLessThanOrEqual(50);
    });
  });

  describe("list", () => {
    it("should return empty array when no checkpoints", () => {
      expect(manager.list()).toEqual([]);
    });

    it("should list checkpoints sorted by time (newest first)", () => {
      manager.save({ percentage: 30, threshold: "green", summary: "first", keyFiles: [], decisions: [] });
      manager.save({ percentage: 50, threshold: "yellow", summary: "second", keyFiles: [], decisions: [] });

      const list = manager.list();
      expect(list.length).toBe(2);
      expect(list[0].summary).toBe("second");
    });

    it("should ignore invalid checkpoint files", () => {
      fs.writeFileSync(path.join(tmpDir, "ctx-checkpoint-20260327-140000-000.md"), "garbage");
      fs.writeFileSync(
        path.join(tmpDir, "ctx-checkpoint-20260327-150000-000.md"),
        "---\ntype: checkpoint\ntimestamp: 2026-03-27T15:00:00Z\n---\n\n## Checkpoint\nValid summary",
        "utf8"
      );

      const list = manager.list();
      expect(list).toHaveLength(1);
      expect(list[0].summary).toBe("Valid summary");
    });
  });

  describe("latest", () => {
    it("should return null when no checkpoints", () => {
      expect(manager.latest()).toBeNull();
    });

    it("should return the most recent checkpoint", () => {
      manager.save({ percentage: 30, threshold: "green", summary: "old", keyFiles: [], decisions: [] });
      manager.save({ percentage: 60, threshold: "orange", summary: "new", keyFiles: [], decisions: [] });

      const latest = manager.latest();
      expect(latest.summary).toBe("new");
    });

    it("should prefer the latest valid timestamp over invalid timestamps", () => {
      fs.writeFileSync(
        path.join(tmpDir, "ctx-checkpoint-20260327-150000-000.md"),
        "---\ntype: checkpoint\npercentage: 50\nthreshold: yellow\ntimestamp: 2026-03-27T15:00:00Z\n---\n\n## Checkpoint\nOlder valid",
        "utf8"
      );
      fs.writeFileSync(
        path.join(tmpDir, "ctx-checkpoint-20260327-160000-000.md"),
        "---\ntype: checkpoint\npercentage: 70\nthreshold: orange\ntimestamp: invalid\n---\n\n## Checkpoint\nNewer invalid timestamp",
        "utf8"
      );

      const latest = manager.latest();
      expect(latest.summary).toBe("Older valid");
    });
  });

  describe("cleanup", () => {
    it("should keep only the last N checkpoints", () => {
      for (let i = 0; i < 10; i++) {
        manager.save({ percentage: i * 10, threshold: "green", summary: `cp-${i}`, keyFiles: [], decisions: [] });
      }

      manager.cleanup(3);
      expect(manager.list().length).toBe(3);
    });

    it("should keep newest checkpoints", () => {
      for (let i = 0; i < 5; i++) {
        manager.save({ percentage: i * 10, threshold: "green", summary: `cp-${i}`, keyFiles: [], decisions: [] });
      }

      manager.cleanup(2);
      const list = manager.list();
      expect(list[0].summary).toBe("cp-4");
      expect(list[1].summary).toBe("cp-3");
    });
  });
});
