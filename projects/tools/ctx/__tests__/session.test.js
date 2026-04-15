const { SessionManager } = require("../src/session");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("SessionManager", () => {
  let tmpDir;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-session-"));
    manager = new SessionManager({ ctxDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("startSession", () => {
    it("should create a session file with timestamp", () => {
      manager.startSession();
      const sessionFile = path.join(tmpDir, "current-session.json");
      expect(fs.existsSync(sessionFile)).toBe(true);
    });

    it("should record start time", () => {
      manager.startSession();
      const data = manager.currentSession();
      expect(data).toHaveProperty("startedAt");
      expect(data.startedAt).toBeTruthy();
    });
  });

  describe("resume", () => {
    it("should detect previous checkpoint and return resume info", () => {
      // Create a checkpoint
      const cpDir = path.join(tmpDir, "checkpoints");
      fs.mkdirSync(cpDir, { recursive: true });
      fs.writeFileSync(
        path.join(cpDir, "ctx-checkpoint-20260327-140000-000.md"),
        "---\ntype: checkpoint\npercentage: 60\n---\n## Checkpoint at 60%\nWorking on auth.",
        "utf8"
      );

      const resume = manager.resume();
      expect(resume).not.toBeNull();
      expect(resume.hasCheckpoint).toBe(true);
      expect(resume.summary).toContain("auth");
    });

    it("should return null when no previous session", () => {
      const resume = manager.resume();
      expect(resume).toBeNull();
    });

    it("should detect emergency snapshots", () => {
      const cpDir = path.join(tmpDir, "checkpoints");
      fs.mkdirSync(cpDir, { recursive: true });
      fs.writeFileSync(
        path.join(cpDir, "ctx-emergency-20260327-150000-000.md"),
        "---\ntype: emergency\n---\n## Emergency\nAuth refactor interrupted.",
        "utf8"
      );

      const resume = manager.resume();
      expect(resume.hasEmergency).toBe(true);
    });

    it("should ignore invalid newer emergency files when a valid checkpoint exists", () => {
      const cpDir = path.join(tmpDir, "checkpoints");
      fs.mkdirSync(cpDir, { recursive: true });
      fs.writeFileSync(
        path.join(cpDir, "ctx-checkpoint-20260327-140000-000.md"),
        "---\ntype: checkpoint\npercentage: 60\n---\n## Checkpoint at 60%\nWorking on auth.",
        "utf8"
      );
      fs.writeFileSync(
        path.join(cpDir, "ctx-emergency-20260327-150000-000.md"),
        "garbage",
        "utf8"
      );

      const resume = manager.resume();
      expect(resume).not.toBeNull();
      expect(resume.filename).toBe("ctx-checkpoint-20260327-140000-000.md");
      expect(resume.summary).toContain("auth");
    });

    it("should recover summary from legacy checkpoint content without percentage", () => {
      const cpDir = path.join(tmpDir, "checkpoints");
      fs.mkdirSync(cpDir, { recursive: true });
      fs.writeFileSync(
        path.join(cpDir, "ctx-checkpoint-20260327-140000-000.md"),
        "---\ntype: checkpoint\n---\n## Checkpoint\nLegacy auth summary",
        "utf8"
      );

      const resume = manager.resume();
      expect(resume).not.toBeNull();
      expect(resume.percentage).toBe(0);
      expect(resume.summary).toBe("Legacy auth summary");
    });
  });

  describe("formatResumeMessage", () => {
    it("should format a checkpoint resume message", () => {
      const msg = manager.formatResumeMessage({
        hasCheckpoint: true,
        hasEmergency: false,
        percentage: 60,
        summary: "Working on auth module",
      });
      expect(msg).toContain("60%");
      expect(msg).toContain("auth");
    });

    it("should prioritize emergency over checkpoint", () => {
      const msg = manager.formatResumeMessage({
        hasCheckpoint: true,
        hasEmergency: true,
        percentage: 85,
        summary: "Auth interrupted by compaction",
      });
      expect(msg).toContain("emergency");
    });
  });

  describe("endSession", () => {
    it("should remove current session file", () => {
      manager.startSession();
      manager.endSession();
      expect(fs.existsSync(path.join(tmpDir, "current-session.json"))).toBe(false);
    });

    it("should be safe to call without active session", () => {
      expect(() => manager.endSession()).not.toThrow();
    });
  });
});
