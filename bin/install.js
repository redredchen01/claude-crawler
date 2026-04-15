#!/usr/bin/env node

/**
 * session-wrap-skill installer
 * Auto-detects AI agent platform and installs SKILL.md to the correct location.
 *
 * Usage: npx session-wrap-skill install
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();
const SKILL_SRC = path.join(__dirname, "..", "SKILL.md");

const PLATFORMS = [
  {
    name: "Claude Code",
    detect: () => fs.existsSync(path.join(HOME, ".claude")),
    install: () => {
      const dir = path.join(HOME, ".claude", "skills", "session-wrap");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(SKILL_SRC, path.join(dir, "SKILL.md"));
      return dir;
    },
  },
  {
    name: "OpenClaw (global)",
    detect: () => fs.existsSync(path.join(HOME, ".openclaw")),
    install: () => {
      const dir = path.join(HOME, ".openclaw", "skills", "session-wrap");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(SKILL_SRC, path.join(dir, "SKILL.md"));
      return dir;
    },
  },
  {
    name: "Cursor",
    detect: () => fs.existsSync(path.join(process.cwd(), ".cursor")),
    install: () => {
      const dir = path.join(process.cwd(), ".cursor", "rules");
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, "session-wrap.mdc");
      fs.copyFileSync(SKILL_SRC, dest);
      return dest;
    },
  },
  {
    name: "Cline",
    detect: () =>
      fs.existsSync(path.join(process.cwd(), ".cline")) ||
      fs.existsSync(path.join(process.cwd(), ".clinerules")),
    install: () => {
      const dir = path.join(process.cwd(), ".cline", "rules");
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, "session-wrap.md");
      fs.copyFileSync(SKILL_SRC, dest);
      return dest;
    },
  },
  {
    name: "Roo Code",
    detect: () =>
      fs.existsSync(path.join(process.cwd(), ".roo")) ||
      fs.existsSync(path.join(process.cwd(), ".roorules")),
    install: () => {
      const dir = path.join(process.cwd(), ".roo", "rules");
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, "session-wrap.md");
      fs.copyFileSync(SKILL_SRC, dest);
      return dest;
    },
  },
  {
    name: "Windsurf",
    detect: () =>
      fs.existsSync(path.join(process.cwd(), ".windsurf")) ||
      fs.existsSync(path.join(process.cwd(), ".windsurfrules")),
    install: () => {
      const dir = path.join(process.cwd(), ".ai-memory");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(SKILL_SRC, path.join(dir, "SKILL.md"));
      return dir + " (Windsurf has native Memories DB — .ai-memory/ as backup)";
    },
  },
  {
    name: "Gemini CLI",
    detect: () =>
      fs.existsSync(path.join(HOME, ".gemini")) ||
      fs.existsSync(path.join(process.cwd(), "GEMINI.md")),
    install: () => appendBootstrap("GEMINI.md"),
  },
  {
    name: "Codex",
    detect: () => fs.existsSync(path.join(process.cwd(), "AGENTS.md")),
    install: () => appendBootstrap("AGENTS.md"),
  },
  {
    name: "Amp",
    detect: () => fs.existsSync(path.join(process.cwd(), "AGENT.md")),
    install: () => appendBootstrap("AGENT.md"),
  },
  {
    name: "GitHub Copilot",
    detect: () =>
      fs.existsSync(
        path.join(process.cwd(), ".github", "copilot-instructions.md")
      ),
    install: () =>
      appendBootstrap(
        path.join(".github", "copilot-instructions.md")
      ),
  },
  {
    name: "Continue.dev",
    detect: () =>
      fs.existsSync(path.join(process.cwd(), ".continue")) ||
      fs.existsSync(path.join(process.cwd(), ".continuerules")),
    install: () => appendBootstrap(".continuerules"),
  },
];

const BOOTSTRAP_MARKER = "# Auto-Memory (session-wrap)";
const BOOTSTRAP_CONTENT = `
${BOOTSTRAP_MARKER}
On session start, read all .md files in .ai-memory/ directory for project context from previous sessions.
`;

function appendBootstrap(filename) {
  const filepath = path.join(process.cwd(), filename);
  const dir = path.join(process.cwd(), ".ai-memory");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(SKILL_SRC, path.join(dir, "SKILL.md"));

  if (fs.existsSync(filepath)) {
    const content = fs.readFileSync(filepath, "utf8");
    if (content.includes(BOOTSTRAP_MARKER)) {
      return `${filepath} (bootstrap already present) + .ai-memory/`;
    }
    fs.appendFileSync(filepath, BOOTSTRAP_CONTENT);
  } else {
    fs.writeFileSync(filepath, BOOTSTRAP_CONTENT.trim() + "\n");
  }
  return `${filepath} (bootstrap added) + .ai-memory/`;
}

function main() {
  const cmd = process.argv[2];

  if (cmd === "install") {
    console.log("\n🧠 session-wrap-skill installer\n");

    const detected = PLATFORMS.filter((p) => p.detect());

    if (detected.length === 0) {
      console.log("No known AI agent platform detected.");
      console.log("Installing to .ai-memory/ (universal fallback)...\n");
      const dir = path.join(process.cwd(), ".ai-memory");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(SKILL_SRC, path.join(dir, "SKILL.md"));
      console.log(`  ✅ Installed to ${dir}/SKILL.md`);
      console.log(
        "\nAdd this to your agent's instructions file:"
      );
      console.log(
        '  "On session start, read all .md files in .ai-memory/ for prior context."'
      );
    } else {
      console.log(
        `Detected ${detected.length} platform(s):\n`
      );
      for (const p of detected) {
        const result = p.install();
        console.log(`  ✅ ${p.name} → ${result}`);
      }
    }

    console.log("\n✨ Done! Say '收工' or 'wrap up' to save context at session end.\n");
  } else if (cmd === "uninstall") {
    console.log("\n🧹 session-wrap-skill uninstaller\n");
    const paths = [
      path.join(HOME, ".claude", "skills", "session-wrap"),
      path.join(HOME, ".openclaw", "skills", "session-wrap"),
      path.join(process.cwd(), ".cursor", "rules", "session-wrap.mdc"),
      path.join(process.cwd(), ".cline", "rules", "session-wrap.md"),
      path.join(process.cwd(), ".roo", "rules", "session-wrap.md"),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true });
        } else {
          fs.unlinkSync(p);
        }
        console.log(`  🗑️  Removed ${p}`);
      }
    }
    console.log("\n✨ Uninstalled. Memory files in .ai-memory/ are preserved.\n");
  } else {
    console.log(`
🧠 session-wrap-skill — Universal AI Agent Memory Persistence

Commands:
  npx session-wrap-skill install     Auto-detect platform & install
  npx session-wrap-skill uninstall   Remove skill files (keeps memory)

Manual:
  Copy SKILL.md to your agent's skill/rules directory.
  See README.md for platform-specific instructions.
`);
  }
}

main();
