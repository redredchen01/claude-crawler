const { CompactionGuard } = require("../src/compaction");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("CompactionGuard", () => {
  let tmpDir;
  let guard;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-compact-"));
    guard = new CompactionGuard({ dir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detectCompaction", () => {
    it("should detect [compacted] signal", () => {
      expect(guard.detectCompaction("[compacted] Previous conversation summarized")).toBe(true);
    });

    it("should detect compaction marker in system message", () => {
      expect(guard.detectCompaction("System: conversation has been compacted")).toBe(true);
    });

    it("should not false-positive on normal text", () => {
      expect(guard.detectCompaction("Let me read the file")).toBe(false);
    });

    it("should detect re-read signal", () => {
      guard.markFileRead("src/auth.js");
      expect(guard.isReReadSignal("src/auth.js")).toBe(true);
    });

    it("should not flag first read as re-read", () => {
      expect(guard.isReReadSignal("src/auth.js")).toBe(false);
    });
  });

  describe("emergencySave", () => {
    it("should write a snapshot file", () => {
      guard.emergencySave({
        currentTask: "Refactoring auth module",
        keyDecisions: ["Use JWT", "Stateless sessions"],
        modifiedFiles: ["src/auth.js", "src/middleware.js"],
        pendingWork: ["Finish middleware endpoints"],
        criticalContext: "The old auth used cookies, we're migrating to JWT because of CORS issues",
      });

      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith("ctx-emergency-"));
      expect(files.length).toBe(1);
    });

    it("should include all critical information", () => {
      guard.emergencySave({
        currentTask: "Auth refactor",
        keyDecisions: ["Use JWT"],
        modifiedFiles: ["src/auth.js"],
        pendingWork: ["Tests"],
        criticalContext: "CORS migration",
      });

      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith("ctx-emergency-"));
      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(content).toContain("Auth refactor");
      expect(content).toContain("Use JWT");
      expect(content).toContain("src/auth.js");
      expect(content).toContain("Tests");
      expect(content).toContain("CORS migration");
    });

    it("should include type: emergency in frontmatter", () => {
      guard.emergencySave({
        currentTask: "test",
        keyDecisions: [],
        modifiedFiles: [],
        pendingWork: [],
        criticalContext: "",
      });

      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith("ctx-emergency-"));
      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(content).toContain("type: emergency");
    });
  });

  describe("latestSnapshot", () => {
    it("should return null when no snapshots", () => {
      expect(guard.latestSnapshot()).toBeNull();
    });

    it("should return the latest emergency snapshot", () => {
      guard.emergencySave({ currentTask: "first", keyDecisions: [], modifiedFiles: [], pendingWork: [], criticalContext: "" });
      guard.emergencySave({ currentTask: "second", keyDecisions: [], modifiedFiles: [], pendingWork: [], criticalContext: "" });

      const latest = guard.latestSnapshot();
      expect(latest).toContain("second");
    });
  });
});
