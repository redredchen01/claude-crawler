const fs = require("fs");
const path = require("path");

class SessionManager {
  constructor({ ctxDir }) {
    this.ctxDir = ctxDir;
    this.sessionFile = path.join(ctxDir, "current-session.json");
    this.checkpointDir = path.join(ctxDir, "checkpoints");
  }

  startSession() {
    const data = {
      startedAt: new Date().toISOString(),
      platform: process.env.CTX_PLATFORM || "unknown",
    };
    fs.writeFileSync(this.sessionFile, JSON.stringify(data, null, 2), "utf8");
  }

  currentSession() {
    if (!fs.existsSync(this.sessionFile)) return null;
    return JSON.parse(fs.readFileSync(this.sessionFile, "utf8"));
  }

  parseCheckpointFile(filename) {
    const fullPath = path.join(this.checkpointDir, filename);
    const content = fs.readFileSync(fullPath, "utf8");
    const type = filename.startsWith("ctx-emergency-") ? "emergency" : "checkpoint";
    const hasFrontmatter = content.startsWith("---");
    const hasExpectedHeader = /^##\s+(Checkpoint|Emergency)/m.test(content);
    const body = content.split("---").slice(2).join("---").trim();
    const bodyLines = body ? body.split("\n") : content.split("\n");

    let summary = "";
    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("type:") && !trimmed.startsWith("percentage:") && !trimmed.startsWith("threshold:") && !trimmed.startsWith("timestamp:")) {
        summary = trimmed;
        break;
      }
    }

    const pctMatch = content.match(/percentage:\s*(\d+)/);
    if (!hasFrontmatter && !hasExpectedHeader) return null;
    if (!summary && !pctMatch) return null;

    return {
      filename,
      type,
      percentage: pctMatch ? parseInt(pctMatch[1]) : 0,
      summary,
    };
  }

  resume() {
    if (!fs.existsSync(this.checkpointDir)) return null;

    const files = fs.readdirSync(this.checkpointDir).filter((f) => f.endsWith(".md")).sort().reverse();
    if (files.length === 0) return null;

    const parsedFiles = files
      .filter((f) => f.startsWith("ctx-emergency-") || f.startsWith("ctx-checkpoint-"))
      .map((f) => this.parseCheckpointFile(f))
      .filter(Boolean);

    if (parsedFiles.length === 0) return null;

    const latest = parsedFiles[0];
    const hasEmergency = parsedFiles.some((f) => f.type === "emergency");
    const hasCheckpoint = parsedFiles.some((f) => f.type === "checkpoint");

    return {
      hasCheckpoint,
      hasEmergency,
      percentage: latest.percentage,
      summary: latest.summary,
      filename: latest.filename,
    };
  }

  formatResumeMessage({ hasCheckpoint, hasEmergency, percentage, summary }) {
    if (hasEmergency) {
      return `⚠️ Resuming from emergency save (context was at ~${percentage}%). Last session: ${summary}`;
    }
    if (hasCheckpoint) {
      return `📋 Resuming from checkpoint (~${percentage}%). Last session: ${summary}`;
    }
    return "";
  }

  endSession() {
    if (fs.existsSync(this.sessionFile)) {
      fs.unlinkSync(this.sessionFile);
    }
  }
}

module.exports = { SessionManager };
