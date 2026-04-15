const fs = require("fs");
const path = require("path");

const COMPACTION_SIGNALS = [
  /\[compacted\]/i,
  /conversation.*compacted/i,
  /context.*compressed/i,
  /previous.*summarized/i,
];

class CompactionGuard {
  constructor({ dir }) {
    this.dir = dir;
    this._readFiles = new Set();
    this._seq = 0;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  detectCompaction(text) {
    return COMPACTION_SIGNALS.some((re) => re.test(text));
  }

  markFileRead(filepath) {
    this._readFiles.add(filepath);
  }

  isReReadSignal(filepath) {
    return this._readFiles.has(filepath);
  }

  emergencySave({ currentTask, keyDecisions, modifiedFiles, pendingWork, criticalContext }) {
    const now = new Date();
    now.setMilliseconds(now.getMilliseconds() + this._seq++);
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const filename = `ctx-emergency-${ts}-${ms}.md`;

    const lines = [
      "---",
      "type: emergency",
      `timestamp: ${now.toISOString()}`,
      "reason: compaction detected or context critical",
      "---",
      "",
      "## Emergency Context Dump",
      "",
      `### Current Task`,
      currentTask || "(none)",
      "",
    ];

    if (keyDecisions && keyDecisions.length > 0) {
      lines.push("### Key Decisions");
      for (const d of keyDecisions) lines.push(`- ${d}`);
      lines.push("");
    }

    if (modifiedFiles && modifiedFiles.length > 0) {
      lines.push("### Modified Files");
      for (const f of modifiedFiles) lines.push(`- ${f}`);
      lines.push("");
    }

    if (pendingWork && pendingWork.length > 0) {
      lines.push("### Pending Work");
      for (const w of pendingWork) lines.push(`- ${w}`);
      lines.push("");
    }

    if (criticalContext) {
      lines.push("### Critical Context");
      lines.push(criticalContext);
      lines.push("");
    }

    fs.writeFileSync(path.join(this.dir, filename), lines.join("\n"), "utf8");
  }

  latestSnapshot() {
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => f.startsWith("ctx-emergency-") && f.endsWith(".md"))
      .sort()
      .reverse();

    if (files.length === 0) return null;
    return fs.readFileSync(path.join(this.dir, files[0]), "utf8");
  }
}

module.exports = { CompactionGuard };
