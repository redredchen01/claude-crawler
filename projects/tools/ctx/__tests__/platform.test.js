const { PlatformDetector } = require("../src/platform");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("PlatformDetector", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detect", () => {
    it("should detect OpenClaw by ~/.openclaw directory", () => {
      const openclawDir = path.join(tmpDir, ".openclaw");
      fs.mkdirSync(openclawDir);
      const result = PlatformDetector.detect({
        homeDir: tmpDir,
        projectDir: tmpDir,
      });
      expect(result.name).toBe("openclaw");
    });

    it("should detect Claude Code by ~/.claude directory", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir);
      const result = PlatformDetector.detect({
        homeDir: tmpDir,
        projectDir: tmpDir,
      });
      expect(result.name).toBe("claude-code");
    });

    it("should detect Cursor by .cursor directory in project", () => {
      const cursorDir = path.join(tmpDir, ".cursor");
      fs.mkdirSync(cursorDir);
      const result = PlatformDetector.detect({
        homeDir: os.tmpdir(),
        projectDir: tmpDir,
      });
      expect(result.name).toBe("cursor");
    });

    it("should detect Cline by .cline directory", () => {
      const clineDir = path.join(tmpDir, ".cline");
      fs.mkdirSync(clineDir);
      const result = PlatformDetector.detect({
        homeDir: os.tmpdir(),
        projectDir: tmpDir,
      });
      expect(result.name).toBe("cline");
    });

    it("should detect Kilo Code by .kilo directory", () => {
      const kiloDir = path.join(tmpDir, ".kilo");
      fs.mkdirSync(kiloDir);
      const result = PlatformDetector.detect({
        homeDir: os.tmpdir(),
        projectDir: tmpDir,
      });
      expect(result.name).toBe("kilo");
    });

    it("should fallback to unknown when no platform detected", () => {
      const result = PlatformDetector.detect({
        homeDir: tmpDir,
        projectDir: tmpDir,
      });
      expect(result.name).toBe("unknown");
    });

    it("should prioritize OpenClaw when multiple platforms detected", () => {
      fs.mkdirSync(path.join(tmpDir, ".openclaw"));
      fs.mkdirSync(path.join(tmpDir, ".claude"));
      const result = PlatformDetector.detect({
        homeDir: tmpDir,
        projectDir: tmpDir,
      });
      expect(result.name).toBe("openclaw");
    });
  });

  describe("platform properties", () => {
    it("should return correct context window size for each platform", () => {
      const platforms = PlatformDetector.platforms;
      expect(platforms.openclaw.contextWindow).toBe(200_000);
      expect(platforms["claude-code"].contextWindow).toBe(200_000);
      expect(platforms.cursor.contextWindow).toBe(128_000);
      expect(platforms.cline.contextWindow).toBe(200_000);
    });

    it("should return memory path for each platform", () => {
      const platforms = PlatformDetector.platforms;
      expect(platforms.openclaw.memoryPath).toBeTruthy();
      expect(platforms["claude-code"].memoryPath).toBeTruthy();
    });

    it("should return checkpoint path for each platform", () => {
      const platforms = PlatformDetector.platforms;
      for (const [, p] of Object.entries(platforms)) {
        expect(p.checkpointPath).toBeTruthy();
      }
    });
  });
});
