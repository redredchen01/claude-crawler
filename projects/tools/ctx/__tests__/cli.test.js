const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const CLI = path.join(__dirname, "..", "bin", "cli.js");

describe("CLI", () => {
  it("should show help when no command given", () => {
    const output = execSync(`node "${CLI}"`, { encoding: "utf8" });
    expect(output).toContain("ctx");
    expect(output).toContain("install");
    expect(output).toContain("uninstall");
    expect(output).toContain("status");
  });

  it("should show help with supported platforms", () => {
    const output = execSync(`node "${CLI}"`, { encoding: "utf8" });
    expect(output).toContain("OpenClaw");
    expect(output).toContain("Claude Code");
  });

  describe("install", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-cli-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should create .ctx/checkpoints/ directory", () => {
      execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      expect(fs.existsSync(path.join(tmpDir, ".ctx", "checkpoints"))).toBe(true);
    });

    it("should detect OpenClaw and install", () => {
      fs.mkdirSync(path.join(tmpDir, ".openclaw"), { recursive: true });
      const output = execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      expect(output).toContain("OpenClaw");
      expect(fs.existsSync(path.join(tmpDir, ".openclaw", "skills", "ctx", "SKILL.md"))).toBe(true);
    });

    it("should install lite version by default", () => {
      fs.mkdirSync(path.join(tmpDir, ".openclaw"), { recursive: true });
      execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      const installed = fs.readFileSync(
        path.join(tmpDir, ".openclaw", "skills", "ctx", "SKILL.md"),
        "utf8"
      );
      expect(installed).toContain("name: ctx");
      // Lite version should be small
      expect(installed.length).toBeLessThan(2100);
    });

    it("should install full version with --full flag", () => {
      fs.mkdirSync(path.join(tmpDir, ".openclaw"), { recursive: true });
      execSync(`node "${CLI}" install --full`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      const installed = fs.readFileSync(
        path.join(tmpDir, ".openclaw", "skills", "ctx", "SKILL.md"),
        "utf8"
      );
      expect(installed).toContain("name: ctx-full");
    });

    it("should fallback to .ctx/ when no platform detected", () => {
      const output = execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      expect(output).toContain("universal fallback");
      expect(fs.existsSync(path.join(tmpDir, ".ctx", "SKILL.md"))).toBe(true);
    });

    it("should install to .clinerules when legacy Cline rules directory is present", () => {
      fs.mkdirSync(path.join(tmpDir, ".clinerules"), { recursive: true });
      execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      expect(fs.existsSync(path.join(tmpDir, ".clinerules", "ctx.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".cline", "rules", "ctx.md"))).toBe(false);
    });

    it("should install to .roorules when legacy Roo rules directory is present", () => {
      fs.mkdirSync(path.join(tmpDir, ".roorules"), { recursive: true });
      execSync(`node "${CLI}" install`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });
      expect(fs.existsSync(path.join(tmpDir, ".roorules", "ctx.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".roo", "rules", "ctx.md"))).toBe(false);
    });
  });

  describe("status", () => {
    it("should report no state when not initialized", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-status-"));
      const output = execSync(`node "${CLI}" status`, {
        encoding: "utf8",
        cwd: tmpDir,
      });
      expect(output).toContain("No .ctx/state.json");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should report corrupted state.json instead of crashing", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-status-"));
      fs.mkdirSync(path.join(tmpDir, ".ctx"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".ctx", "state.json"), "not json");

      const output = execSync(`node "${CLI}" status`, {
        encoding: "utf8",
        cwd: tmpDir,
      });

      expect(output).toContain("State file is corrupted");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should normalize invalid maxTokens when rendering status", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-status-"));
      fs.mkdirSync(path.join(tmpDir, ".ctx"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".ctx", "state.json"),
        JSON.stringify({ usedTokens: 1000, maxTokens: 0, filesRead: [] })
      );

      const output = execSync(`node "${CLI}" status`, {
        encoding: "utf8",
        cwd: tmpDir,
      });

      expect(output).toContain("1K / 200K tokens");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("hook", () => {
    it("should recover from corrupted Claude settings.json", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-hook-cli-"));
      fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".claude", "settings.json"), "not json");

      const output = execSync(`node "${CLI}" hook`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });

      expect(output).toContain("settings.json is corrupted");
      const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf8"));
      expect(Array.isArray(settings.hooks.afterToolUse)).toBe(true);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should normalize non-array afterToolUse objects", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-hook-cli-"));
      fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".claude", "settings.json"),
        JSON.stringify({ hooks: { afterToolUse: { command: "bash old.sh" } } })
      );

      const output = execSync(`node "${CLI}" hook`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });

      expect(output).toContain("afterToolUse was not an array");
      const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf8"));
      expect(Array.isArray(settings.hooks.afterToolUse)).toBe(true);
      expect(settings.hooks.afterToolUse).toHaveLength(1);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should normalize non-array afterToolUse strings", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-hook-cli-"));
      fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".claude", "settings.json"),
        JSON.stringify({ hooks: { afterToolUse: "bash old.sh" } })
      );

      execSync(`node "${CLI}" hook`, {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir },
      });

      const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf8"));
      expect(Array.isArray(settings.hooks.afterToolUse)).toBe(true);
      expect(settings.hooks.afterToolUse[0].command).toContain("ctx-track");
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
