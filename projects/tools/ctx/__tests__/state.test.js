const { StateManager } = require("../src/state");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("StateManager", () => {
  let tmpDir;
  let state;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-state-"));
    state = new StateManager({ ctxDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("should create state.json with defaults", () => {
      state.init({ maxTokens: 200000 });
      const fp = path.join(tmpDir, "state.json");
      expect(fs.existsSync(fp)).toBe(true);
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      expect(data.maxTokens).toBe(200000);
      expect(data.usedTokens).toBe(0);
    });

    it("should create checkpoints directory", () => {
      state.init({ maxTokens: 200000 });
      expect(fs.existsSync(path.join(tmpDir, "checkpoints"))).toBe(true);
    });

    it("should not overwrite existing state", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 100);
      state.save();
      state.init({ maxTokens: 200000 }); // re-init
      const data = state.load();
      expect(data.filesRead.length).toBe(1); // preserved
    });
  });

  describe("trackRead", () => {
    it("should record file read in state", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("src/auth.js", 150);
      state.save();
      const data = state.load();
      expect(data.filesRead).toContainEqual(expect.objectContaining({ path: "src/auth.js", lines: 150 }));
    });

    it("should increment usedTokens", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 100);
      state.save();
      expect(state.load().usedTokens).toBe(100 * 15);
    });

    it("should detect and count duplicates", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 100);
      const dup = state.trackRead("a.js", 100);
      expect(dup).toBe(true); // is duplicate
      state.save();
      expect(state.load().dupCount).toBe(1);
    });
  });

  describe("trackResponse", () => {
    it("should add response tokens", () => {
      state.init({ maxTokens: 200000 });
      state.trackResponse(500);
      state.save();
      expect(state.load().usedTokens).toBeGreaterThan(0);
      expect(state.load().responseCount).toBe(1);
    });
  });

  describe("trackToolCall", () => {
    it("should add tool call tokens", () => {
      state.init({ maxTokens: 200000 });
      state.trackToolCall("Bash");
      state.save();
      expect(state.load().toolCallCount).toBe(1);
    });
  });

  describe("threshold", () => {
    it("should return green when low usage", () => {
      state.init({ maxTokens: 200000 });
      expect(state.threshold()).toBe("green");
    });

    it("should return yellow at 40-60%", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 100000;
      expect(state.threshold()).toBe("yellow");
    });

    it("should return orange at 60-80%", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 140000;
      expect(state.threshold()).toBe("orange");
    });

    it("should return red above 80%", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 170000;
      expect(state.threshold()).toBe("red");
    });
  });

  describe("percentage", () => {
    it("should calculate percentage", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 50000;
      expect(state.percentage()).toBe(25);
    });
  });

  describe("isDuplicate", () => {
    it("should detect full re-read", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 100);
      expect(state.isDuplicate("a.js")).toBe(true);
    });

    it("should not flag unread file", () => {
      state.init({ maxTokens: 200000 });
      expect(state.isDuplicate("b.js")).toBe(false);
    });
  });

  describe("responseBudget", () => {
    it("should return normal for green", () => {
      state.init({ maxTokens: 200000 });
      expect(state.responseBudget()).toBe("normal");
    });

    it("should return 300w for yellow", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 100000;
      expect(state.responseBudget()).toBe("~300 words");
    });

    it("should return 150w for orange", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 140000;
      expect(state.responseBudget()).toBe("~150 words");
    });

    it("should return 50w for red", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 170000;
      expect(state.responseBudget()).toBe("~50 words");
    });
  });

  describe("statusLine", () => {
    it("should format compact status string", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 100);
      state.trackToolCall("Bash");
      const line = state.statusLine();
      expect(line).toContain("ctx:");
      expect(line).toContain("🟢");
      expect(line.length).toBeLessThanOrEqual(80);
    });
  });

  describe("generateStatusMd", () => {
    it("should write status.md", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("src/auth.js", 100);
      state.trackRead("src/index.js", 50);
      state.trackToolCall("Bash");
      state.trackResponse(200);
      state.generateStatusMd();
      const mdPath = path.join(tmpDir, "status.md");
      expect(fs.existsSync(mdPath)).toBe(true);
      const content = fs.readFileSync(mdPath, "utf8");
      expect(content).toContain("src/auth.js");
      expect(content).toContain("src/index.js");
    });

    it("should escape markdown table-breaking characters in file paths", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("src/a|b.js", 10);
      state.trackRead("weird\nname.js", 5);
      state.generateStatusMd();

      const mdPath = path.join(tmpDir, "status.md");
      const content = fs.readFileSync(mdPath, "utf8");
      expect(content).toContain("src/a\\|b.js");
      expect(content).toContain("| weird name.js | 5 | 1x |");
      expect(content).not.toContain("weird\nname.js");
    });
  });

  describe("shouldCheckpoint", () => {
    it("should trigger at orange threshold (first time)", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 130000;
      expect(state.shouldCheckpoint()).toBe(true);
    });

    it("should not trigger twice for same threshold", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 130000;
      state.shouldCheckpoint(); // marks done
      state.save();
      expect(state.shouldCheckpoint()).toBe(false);
    });

    it("should trigger again at red", () => {
      state.init({ maxTokens: 200000 });
      state._data.usedTokens = 130000;
      state.shouldCheckpoint();
      state._data.usedTokens = 170000;
      expect(state.shouldCheckpoint()).toBe(true);
    });
  });

  describe("toJSON", () => {
    it("should return full state snapshot", () => {
      state.init({ maxTokens: 200000 });
      state.trackRead("a.js", 50);
      const json = state.toJSON();
      expect(json).toHaveProperty("maxTokens");
      expect(json).toHaveProperty("usedTokens");
      expect(json).toHaveProperty("filesRead");
      expect(json).toHaveProperty("dupCount");
      expect(json).toHaveProperty("threshold");
      expect(json).toHaveProperty("percentage");
    });
  });
});
