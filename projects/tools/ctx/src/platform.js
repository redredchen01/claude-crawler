const fs = require("fs");
const path = require("path");

const PLATFORMS = {
  openclaw: {
    contextWindow: 200_000,
    memoryPath: "~/.openclaw/workspace/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ homeDir }) => fs.existsSync(path.join(homeDir, ".openclaw")),
  },
  "claude-code": {
    contextWindow: 200_000,
    memoryPath: "~/.claude/projects/*/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ homeDir }) => fs.existsSync(path.join(homeDir, ".claude")),
  },
  cursor: {
    contextWindow: 128_000,
    memoryPath: ".cursor/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ projectDir }) =>
      fs.existsSync(path.join(projectDir, ".cursor")),
  },
  cline: {
    contextWindow: 200_000,
    memoryPath: ".cline/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ projectDir }) =>
      fs.existsSync(path.join(projectDir, ".cline")) ||
      fs.existsSync(path.join(projectDir, ".clinerules")),
  },
  kilo: {
    contextWindow: 200_000,
    memoryPath: ".kilo/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ projectDir }) =>
      fs.existsSync(path.join(projectDir, ".kilo")),
  },
  roo: {
    contextWindow: 200_000,
    memoryPath: ".roo/memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: ({ projectDir }) =>
      fs.existsSync(path.join(projectDir, ".roo")) ||
      fs.existsSync(path.join(projectDir, ".roorules")),
  },
  unknown: {
    contextWindow: 200_000,
    memoryPath: ".ai-memory/",
    checkpointPath: ".ctx/checkpoints/",
    detect: () => true,
  },
};

// Detection order matters — first match wins
const DETECTION_ORDER = [
  "openclaw",
  "claude-code",
  "cursor",
  "cline",
  "kilo",
  "roo",
  "unknown",
];

class PlatformDetector {
  static detect({ homeDir, projectDir }) {
    for (const name of DETECTION_ORDER) {
      const platform = PLATFORMS[name];
      if (name === "unknown") continue;
      if (platform.detect({ homeDir, projectDir })) {
        return { name, ...platform };
      }
    }
    return { name: "unknown", ...PLATFORMS.unknown };
  }

  static get platforms() {
    return PLATFORMS;
  }
}

module.exports = { PlatformDetector };
