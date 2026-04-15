const fs = require("fs");
const path = require("path");

const TOKENS_PER_LINE = 15;
const TOKENS_PER_RESPONSE_CHAR = 0.25;
const TOKENS_PER_TOOL_CALL = 1500;

const THRESHOLDS = [
  { max: 40, name: "green" },
  { max: 60, name: "yellow" },
  { max: 80, name: "orange" },
  { max: 100, name: "red" },
];

const BUDGETS = {
  green: "normal",
  yellow: "~300 words",
  orange: "~150 words",
  red: "~50 words",
};

const ICONS = { green: "\u{1F7E2}", yellow: "\u{1F7E1}", orange: "\u{1F7E0}", red: "\u{1F534}" };

function escapeTableCell(value) {
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

class StateManager {
  constructor({ ctxDir }) {
    this.ctxDir = ctxDir;
    this.statePath = path.join(ctxDir, "state.json");
    this.statusMdPath = path.join(ctxDir, "status.md");
    this.checkpointDir = path.join(ctxDir, "checkpoints");
    this._data = null;
  }

  init({ maxTokens = 200000 }) {
    if (fs.existsSync(this.statePath)) {
      this._data = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
      return;
    }
    if (!fs.existsSync(this.ctxDir)) fs.mkdirSync(this.ctxDir, { recursive: true });
    if (!fs.existsSync(this.checkpointDir)) fs.mkdirSync(this.checkpointDir, { recursive: true });

    this._data = {
      maxTokens,
      usedTokens: 0,
      filesRead: [],
      dupCount: 0,
      responseCount: 0,
      toolCallCount: 0,
      checkpointedThresholds: [],
      startedAt: new Date().toISOString(),
    };
    this.save();
  }

  load() {
    if (!fs.existsSync(this.statePath)) return null;
    this._data = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    return this._data;
  }

  save() {
    fs.writeFileSync(this.statePath, JSON.stringify(this._data, null, 2), "utf8");
  }

  trackRead(filepath, lines) {
    const existing = this._data.filesRead.find((f) => f.path === filepath);
    if (existing) {
      this._data.dupCount++;
      this._data.usedTokens += lines * TOKENS_PER_LINE;
      existing.readCount++;
      return true; // is duplicate
    }
    this._data.filesRead.push({ path: filepath, lines, readCount: 1, at: new Date().toISOString() });
    this._data.usedTokens += lines * TOKENS_PER_LINE;
    return false;
  }

  trackResponse(chars) {
    this._data.usedTokens += Math.round(chars * TOKENS_PER_RESPONSE_CHAR);
    this._data.responseCount++;
  }

  trackToolCall(type) {
    this._data.usedTokens += TOKENS_PER_TOOL_CALL;
    this._data.toolCallCount++;
  }

  isDuplicate(filepath) {
    return this._data.filesRead.some((f) => f.path === filepath);
  }

  percentage() {
    return Math.min(100, Math.round((this._data.usedTokens / this._data.maxTokens) * 100));
  }

  threshold() {
    const pct = this.percentage();
    for (const t of THRESHOLDS) {
      if (pct < t.max) return t.name;
    }
    return "red";
  }

  responseBudget() {
    return BUDGETS[this.threshold()];
  }

  statusLine() {
    const pct = this.percentage();
    const t = this.threshold();
    const reads = this._data.filesRead.length;
    const dups = this._data.dupCount;
    const tools = this._data.toolCallCount;
    return `[ctx: ~${pct}% | ${reads}r ${tools}t | ${dups}dup | ${ICONS[t]}]`;
  }

  shouldCheckpoint() {
    const t = this.threshold();
    if (t === "green" || t === "yellow") return false;
    if (this._data.checkpointedThresholds.includes(t)) return false;
    this._data.checkpointedThresholds.push(t);
    this.save();
    return true;
  }

  generateStatusMd() {
    const pct = this.percentage();
    const t = this.threshold();
    const lines = [
      `# ctx Status ${ICONS[t]}`,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Context used | ~${pct}% (${Math.round(this._data.usedTokens / 1000)}K / ${Math.round(this._data.maxTokens / 1000)}K tokens) |`,
      `| Threshold | ${t} ${ICONS[t]} |`,
      `| Response budget | ${this.responseBudget()} |`,
      `| Files read | ${this._data.filesRead.length} |`,
      `| Duplicates blocked | ${this._data.dupCount} |`,
      `| Tool calls | ${this._data.toolCallCount} |`,
      `| Responses | ${this._data.responseCount} |`,
      `| Session started | ${this._data.startedAt} |`,
      "",
      "## Files Read",
      "",
      "| File | Lines | Reads |",
      "|------|-------|-------|",
    ];

    for (const f of this._data.filesRead) {
      lines.push(`| ${escapeTableCell(f.path)} | ${escapeTableCell(f.lines)} | ${escapeTableCell(`${f.readCount}x`)} |`);
    }

    lines.push("");
    lines.push(`---`);
    lines.push(`*Updated: ${new Date().toISOString()}*`);

    fs.writeFileSync(this.statusMdPath, lines.join("\n"), "utf8");
  }

  toJSON() {
    return {
      ...this._data,
      threshold: this.threshold(),
      percentage: this.percentage(),
      responseBudget: this.responseBudget(),
    };
  }
}

module.exports = { StateManager };
