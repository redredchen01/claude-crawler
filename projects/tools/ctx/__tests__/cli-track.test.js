const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CLI = path.join(__dirname, "..", "bin", "cli.js");

describe("CLI track command (universal)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-track-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getState() {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, ".ctx", "state.json"), "utf8"));
  }

  it("should auto-init state.json if missing", () => {
    execSync(`node "${CLI}" track tool bash`, { cwd: tmpDir, encoding: "utf8" });
    expect(fs.existsSync(path.join(tmpDir, ".ctx", "state.json"))).toBe(true);
  });

  it("should track file reads", () => {
    execSync(`node "${CLI}" track read src/auth.js 150`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.filesRead.length).toBe(1);
    expect(state.filesRead[0].path).toBe("src/auth.js");
    expect(state.filesRead[0].lines).toBe(150);
  });

  it("should detect duplicate reads", () => {
    execSync(`node "${CLI}" track read src/auth.js 100`, { cwd: tmpDir, encoding: "utf8" });
    const output = execSync(`node "${CLI}" track read src/auth.js 100`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.dupCount).toBe(1);
    expect(output).toContain("DUP");
  });

  it("should track tool calls", () => {
    execSync(`node "${CLI}" track tool bash`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.toolCallCount).toBe(1);
    expect(state.bashCount).toBe(1);
  });

  it("should track write tools", () => {
    execSync(`node "${CLI}" track tool write`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.writeCount).toBe(1);
  });

  it("should track responses", () => {
    execSync(`node "${CLI}" track response 1000`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.responseCount).toBe(1);
    expect(state.usedTokens).toBeGreaterThan(0);
  });

  it("should preserve zero-line reads instead of falling back to default lines", () => {
    execSync(`node "${CLI}" track read src/empty.js 0`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.filesRead[0].lines).toBe(0);
    expect(state.usedTokens).toBe(1500);
  });

  it("should reject negative read line counts", () => {
    expect(() => {
      execSync(`node "${CLI}" track read src/auth.js -10`, { cwd: tmpDir, encoding: "utf8" });
    }).toThrow();

    const state = getState();
    expect(state.usedTokens).toBe(0);
    expect(state.filesRead).toEqual([]);
  });

  it("should preserve zero-char responses instead of falling back to default chars", () => {
    execSync(`node "${CLI}" track response 0`, { cwd: tmpDir, encoding: "utf8" });
    const state = getState();
    expect(state.responseCount).toBe(1);
    expect(state.usedTokens).toBe(0);
  });

  it("should reject negative response sizes", () => {
    expect(() => {
      execSync(`node "${CLI}" track response -50`, { cwd: tmpDir, encoding: "utf8" });
    }).toThrow();

    const state = getState();
    expect(state.responseCount).toBe(0);
    expect(state.usedTokens).toBe(0);
  });

  it("should auto-checkpoint at orange threshold", () => {
    // Push state to near orange
    execSync(`node "${CLI}" track tool`, { cwd: tmpDir, encoding: "utf8" });
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    const state = getState();
    state.usedTokens = 125000; // ~62%
    fs.writeFileSync(statePath, JSON.stringify(state));

    execSync(`node "${CLI}" track tool`, { cwd: tmpDir, encoding: "utf8" });

    const cpDir = path.join(tmpDir, ".ctx", "checkpoints");
    const cps = fs.readdirSync(cpDir).filter((f) => f.includes("checkpoint") && f.includes("auto"));
    expect(cps.length).toBe(1);
  });

  it("should show status line every 5 calls", () => {
    let output = "";
    for (let i = 0; i < 5; i++) {
      output = execSync(`node "${CLI}" track tool`, { cwd: tmpDir, encoding: "utf8" });
    }
    expect(output).toContain("[ctx:");
  });

  it("should accumulate across multiple track calls", () => {
    execSync(`node "${CLI}" track read a.js 50`, { cwd: tmpDir, encoding: "utf8" });
    execSync(`node "${CLI}" track read b.js 100`, { cwd: tmpDir, encoding: "utf8" });
    execSync(`node "${CLI}" track tool bash`, { cwd: tmpDir, encoding: "utf8" });
    execSync(`node "${CLI}" track tool write`, { cwd: tmpDir, encoding: "utf8" });
    execSync(`node "${CLI}" track response 500`, { cwd: tmpDir, encoding: "utf8" });

    const state = getState();
    expect(state.filesRead.length).toBe(2);
    expect(state.toolCallCount).toBe(4); // 2 reads + 2 tools (response doesn't count as tool)
    expect(state.bashCount).toBe(1);
    expect(state.writeCount).toBe(1);
    expect(state.responseCount).toBe(1);
  });
});
