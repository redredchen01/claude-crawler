const { MemoryLoader } = require("../src/loader");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("MemoryLoader", () => {
  let tmpDir;
  let loader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-loader-"));
    loader = new MemoryLoader({ memoryDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeMemory(name, content) {
    fs.writeFileSync(path.join(tmpDir, name), content, "utf8");
  }

  describe("scanIndex", () => {
    it("should parse MEMORY.md index", () => {
      writeMemory("MEMORY.md", [
        "# Memory Index",
        "- [Auth refactor](project_auth.md) — JWT migration in progress",
        "- [Testing prefs](feedback_testing.md) — Use real DB not mocks",
        "- [User profile](user_profile.md) — Senior dev, prefers TDD",
      ].join("\n"));

      const entries = loader.scanIndex();
      expect(entries.length).toBe(3);
      expect(entries[0]).toHaveProperty("title");
      expect(entries[0]).toHaveProperty("file");
      expect(entries[0]).toHaveProperty("description");
    });

    it("should return empty array when no MEMORY.md", () => {
      expect(loader.scanIndex()).toEqual([]);
    });
  });

  describe("relevance", () => {
    it("should score entries by keyword match", () => {
      const entries = [
        { title: "Auth refactor", file: "project_auth.md", description: "JWT migration" },
        { title: "Testing prefs", file: "feedback_testing.md", description: "Use real DB" },
        { title: "Deploy config", file: "reference_deploy.md", description: "Fly.io setup" },
      ];

      const scored = loader.rankByRelevance(entries, "working on auth module JWT");
      expect(scored[0].file).toBe("project_auth.md");
    });

    it("should rank user/feedback higher than project for general queries", () => {
      const entries = [
        { title: "Project X", file: "project_x.md", description: "status update" },
        { title: "Preferences", file: "user_prefs.md", description: "prefers TDD" },
      ];

      const scored = loader.rankByRelevance(entries, "help me write code");
      // user prefs should rank high for general queries
      expect(scored[0].file).toBe("user_prefs.md");
    });
  });

  describe("loadSelective", () => {
    it("should load only top N relevant files", () => {
      writeMemory("MEMORY.md", [
        "# Memory Index",
        "- [Auth](project_auth.md) — JWT migration",
        "- [Testing](feedback_testing.md) — Real DB",
        "- [Deploy](reference_deploy.md) — Fly.io",
        "- [Profile](user_profile.md) — Senior dev",
      ].join("\n"));
      writeMemory("project_auth.md", "---\ntype: project\n---\nAuth stuff");
      writeMemory("feedback_testing.md", "---\ntype: feedback\n---\nTesting stuff");
      writeMemory("reference_deploy.md", "---\ntype: reference\n---\nDeploy stuff");
      writeMemory("user_profile.md", "---\ntype: user\n---\nUser stuff");

      const loaded = loader.loadSelective("working on auth", { maxFiles: 2 });
      expect(loaded.length).toBe(2);
      expect(loaded[0]).toHaveProperty("content");
    });

    it("should always include user and feedback types", () => {
      writeMemory("MEMORY.md", [
        "# Memory Index",
        "- [Project](project_x.md) — some project",
        "- [Prefs](user_prefs.md) — user preferences",
        "- [Feedback](feedback_style.md) — communication style",
      ].join("\n"));
      writeMemory("project_x.md", "---\ntype: project\n---\nProject");
      writeMemory("user_prefs.md", "---\ntype: user\n---\nPrefs");
      writeMemory("feedback_style.md", "---\ntype: feedback\n---\nFeedback");

      const loaded = loader.loadSelective("random task", { maxFiles: 2 });
      const types = loaded.map((l) => l.type);
      expect(types).toContain("user");
      expect(types).toContain("feedback");
    });
  });

  describe("estimateTokens", () => {
    it("should estimate total tokens for loaded memories", () => {
      writeMemory("a.md", "Line 1\nLine 2\nLine 3\n");
      const tokens = loader.estimateTokens([path.join(tmpDir, "a.md")]);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
