const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CLI = path.join(__dirname, "..", "bin", "cli.js");

describe("CLI session commands", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-sess-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("reset", () => {
    it("should reset state.json to zero", () => {
      // Create initial state with some data
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(
        path.join(ctxDir, "state.json"),
        JSON.stringify({ maxTokens: 200000, usedTokens: 50000, filesRead: [{ path: "a.js" }], dupCount: 3, toolCallCount: 20, writeCount: 5, startedAt: "2026-03-27T10:00:00Z" })
      );

      execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      const state = JSON.parse(fs.readFileSync(path.join(ctxDir, "state.json"), "utf8"));
      expect(state.usedTokens).toBe(0);
      expect(state.filesRead).toEqual([]);
      expect(state.dupCount).toBe(0);
    });

    it("should archive session to history.json", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(
        path.join(ctxDir, "state.json"),
        JSON.stringify({ maxTokens: 200000, usedTokens: 80000, filesRead: [{ path: "a.js" }, { path: "b.js" }], dupCount: 2, toolCallCount: 30, writeCount: 8, startedAt: "2026-03-27T10:00:00Z" })
      );

      execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      const historyPath = path.join(ctxDir, "history.json");
      expect(fs.existsSync(historyPath)).toBe(true);
      const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
      expect(history.length).toBe(1);
      expect(history[0].usedTokens).toBe(80000);
      expect(history[0].filesRead).toBe(2);
    });

    it("should accumulate history across resets", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });

      // Session 1
      fs.writeFileSync(path.join(ctxDir, "state.json"), JSON.stringify({ maxTokens: 200000, usedTokens: 50000, filesRead: [], dupCount: 0, toolCallCount: 10, writeCount: 0, startedAt: "2026-03-27T10:00:00Z" }));
      execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      // Session 2
      fs.writeFileSync(path.join(ctxDir, "state.json"), JSON.stringify({ maxTokens: 200000, usedTokens: 90000, filesRead: [{ path: "x.js" }], dupCount: 5, toolCallCount: 40, writeCount: 3, startedAt: "2026-03-27T12:00:00Z" }));
      execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      const history = JSON.parse(fs.readFileSync(path.join(ctxDir, "history.json"), "utf8"));
      expect(history.length).toBe(2);
    });

    it("should recover from corrupted state.json by creating a fresh state", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(path.join(ctxDir, "state.json"), "not json");

      const output = execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      expect(output).toContain("state.json is corrupted");
      const state = JSON.parse(fs.readFileSync(path.join(ctxDir, "state.json"), "utf8"));
      expect(state.usedTokens).toBe(0);
      expect(state.filesRead).toEqual([]);
    });

    it("should recover from corrupted history.json when archiving a valid state", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(
        path.join(ctxDir, "state.json"),
        JSON.stringify({ maxTokens: 200000, usedTokens: 25000, filesRead: [{ path: "a.js" }], dupCount: 1, toolCallCount: 2, writeCount: 0, startedAt: "2026-03-27T10:00:00Z" })
      );
      fs.writeFileSync(path.join(ctxDir, "history.json"), "not json");

      const output = execSync(`node "${CLI}" reset`, { cwd: tmpDir, encoding: "utf8" });

      expect(output).toContain("history.json is corrupted");
      const history = JSON.parse(fs.readFileSync(path.join(ctxDir, "history.json"), "utf8"));
      expect(history.length).toBe(1);
      expect(history[0].usedTokens).toBe(25000);
    });
  });

  describe("history", () => {
    it("should show message when no history", () => {
      const output = execSync(`node "${CLI}" history`, { cwd: tmpDir, encoding: "utf8" });
      expect(output).toContain("No session history");
    });

    it("should display history table", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(path.join(ctxDir, "history.json"), JSON.stringify([
        { startedAt: "2026-03-27T10:00:00Z", endedAt: "2026-03-27T12:00:00Z", usedTokens: 80000, maxTokens: 200000, filesRead: 5, dupCount: 2, toolCallCount: 30, writeCount: 8 },
      ]));

      const output = execSync(`node "${CLI}" history`, { cwd: tmpDir, encoding: "utf8" });
      expect(output).toContain("1 sessions");
      expect(output).toContain("80K");
    });

    it("should recover from corrupted history.json", () => {
      const ctxDir = path.join(tmpDir, ".ctx");
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(path.join(ctxDir, "history.json"), "not json");

      const output = execSync(`node "${CLI}" history`, { cwd: tmpDir, encoding: "utf8" });

      expect(output).toContain("History file is corrupted");
      const history = JSON.parse(fs.readFileSync(path.join(ctxDir, "history.json"), "utf8"));
      expect(history).toEqual([]);
    });
  });

  describe("setup", () => {
    it("should create .ctx/ directory with state.json", () => {
      // setup needs HOME with .openclaw or .claude for install to detect
      execSync(`node "${CLI}" setup`, {
        cwd: tmpDir,
        encoding: "utf8",
        env: { ...process.env, HOME: tmpDir },
      });
      expect(fs.existsSync(path.join(tmpDir, ".ctx", "state.json"))).toBe(true);
    });
  });
});
