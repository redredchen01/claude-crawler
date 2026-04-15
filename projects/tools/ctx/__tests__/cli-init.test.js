const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CLI = path.join(__dirname, "..", "bin", "cli.js");

describe("CLI init command", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-init-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create .ctx/state.json", () => {
    execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(state.maxTokens).toBe(200000);
    expect(state.usedTokens).toBe(0);
  });

  it("should create .ctx/checkpoints/", () => {
    execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });
    expect(fs.existsSync(path.join(tmpDir, ".ctx", "checkpoints"))).toBe(true);
  });

  it("should not overwrite existing state.json", () => {
    // First init
    execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });
    // Modify state
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.usedTokens = 50000;
    fs.writeFileSync(statePath, JSON.stringify(state));
    // Second init
    execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });
    const after = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(after.usedTokens).toBe(50000); // preserved
  });

  it("should recreate corrupted state.json", () => {
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "not json");

    const output = execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });

    expect(output).toContain("state.json was corrupted");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(state.maxTokens).toBe(200000);
    expect(state.usedTokens).toBe(0);
  });

  it("should add .ctx/ to .gitignore if exists", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n");
    execSync(`node "${CLI}" init`, { cwd: tmpDir, encoding: "utf8" });
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    expect(content).toContain(".ctx/");
  });
});
