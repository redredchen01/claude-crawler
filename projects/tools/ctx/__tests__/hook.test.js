const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOOK = path.join(__dirname, "..", "hooks", "ctx-track.sh");

describe("ctx-track.sh hook", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-hook-"));
    const ctxDir = path.join(tmpDir, ".ctx");
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.mkdirSync(path.join(ctxDir, "checkpoints"), { recursive: true });
    // Write initial state
    fs.writeFileSync(
      path.join(ctxDir, "state.json"),
      JSON.stringify({
        maxTokens: 200000,
        usedTokens: 0,
        filesRead: [],
        dupCount: 0,
        responseCount: 0,
        toolCallCount: 0,
        writeCount: 0,
        bashCount: 0,
        checkpointedThresholds: [],
        startedAt: new Date().toISOString(),
      }),
      "utf8"
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runHook(toolName, toolInput = {}) {
    const input = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
    execSync(`echo '${input}' | bash "${HOOK}"`, { cwd: tmpDir, encoding: "utf8" });
    return JSON.parse(fs.readFileSync(path.join(tmpDir, ".ctx", "state.json"), "utf8"));
  }

  it("should increment toolCallCount on any tool call", () => {
    const state = runHook("Bash", { command: "ls" });
    expect(state.toolCallCount).toBe(1);
  });

  it("should add 1500 tokens per tool call", () => {
    const state = runHook("Bash", { command: "ls" });
    expect(state.usedTokens).toBe(1500);
  });

  it("should track file reads in filesRead array", () => {
    const state = runHook("Read", { file_path: "/tmp/test/src/auth.js", limit: 100 });
    expect(state.filesRead.length).toBe(1);
    expect(state.filesRead[0].path).toContain("auth.js");
  });

  it("should detect duplicate reads", () => {
    runHook("Read", { file_path: "/tmp/test/src/auth.js" });
    const state = runHook("Read", { file_path: "/tmp/test/src/auth.js" });
    expect(state.dupCount).toBe(1);
    expect(state.filesRead[0].readCount).toBe(2);
  });

  it("should track writes", () => {
    const state = runHook("Write", { file_path: "/tmp/test/a.js" });
    expect(state.writeCount).toBe(1);
  });

  it("should track bash calls", () => {
    const state = runHook("Bash", { command: "npm test" });
    expect(state.bashCount).toBe(1);
  });

  it("should compute threshold and percentage", () => {
    const state = runHook("Bash", {});
    expect(state._lastThreshold).toBe("green");
    expect(state._lastPercentage).toBeDefined();
  });

  it("should generate status.md every 5 calls", () => {
    for (let i = 0; i < 5; i++) {
      runHook("Bash", {});
    }
    const statusPath = path.join(tmpDir, ".ctx", "status.md");
    expect(fs.existsSync(statusPath)).toBe(true);
    const content = fs.readFileSync(statusPath, "utf8");
    expect(content).toContain("ctx Status");
  });

  it("should auto-create checkpoint at orange threshold", () => {
    // Set state to near-orange
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.usedTokens = 125000; // 62.5% → orange
    state.filesRead = [{ path: "a.js", lines: 100, readCount: 1 }];
    fs.writeFileSync(statePath, JSON.stringify(state));

    // Trigger hook (adds 1500 tokens, pushing further into orange)
    runHook("Bash", {});

    const cpDir = path.join(tmpDir, ".ctx", "checkpoints");
    const cps = fs.readdirSync(cpDir).filter((f) => f.includes("checkpoint") && f.includes("auto"));
    expect(cps.length).toBe(1);

    const content = fs.readFileSync(path.join(cpDir, cps[0]), "utf8");
    expect(content).toContain("Auto-Checkpoint");
    expect(content).toContain("orange");
  });

  it("should auto-create emergency save at red threshold", () => {
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.usedTokens = 165000; // 82.5% → red
    state.filesRead = [{ path: "b.js", lines: 200, readCount: 1 }];
    fs.writeFileSync(statePath, JSON.stringify(state));

    runHook("Bash", {});

    const cpDir = path.join(tmpDir, ".ctx", "checkpoints");
    const emergencies = fs.readdirSync(cpDir).filter((f) => f.includes("emergency"));
    expect(emergencies.length).toBe(1);
  });

  it("should not re-checkpoint same threshold", () => {
    const statePath = path.join(tmpDir, ".ctx", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.usedTokens = 125000;
    state.checkpointedThresholds = ["orange"]; // already done
    fs.writeFileSync(statePath, JSON.stringify(state));

    runHook("Bash", {});

    const cpDir = path.join(tmpDir, ".ctx", "checkpoints");
    const cps = fs.readdirSync(cpDir).filter((f) => f.includes("auto"));
    expect(cps.length).toBe(0);
  });

  it("should not crash when state.json is missing", () => {
    fs.unlinkSync(path.join(tmpDir, ".ctx", "state.json"));
    expect(() => {
      execSync(`echo '{"tool_name":"Bash"}' | bash "${HOOK}"`, { cwd: tmpDir });
    }).not.toThrow();
  });

  it("should accumulate across multiple calls", () => {
    runHook("Read", { file_path: "/tmp/a.js" });
    runHook("Read", { file_path: "/tmp/b.js" });
    runHook("Bash", { command: "npm test" });
    const state = runHook("Write", { file_path: "/tmp/c.js" });
    expect(state.toolCallCount).toBe(4);
    expect(state.filesRead.length).toBe(2);
    expect(state.writeCount).toBe(1);
    expect(state.bashCount).toBe(1);
  });
});
