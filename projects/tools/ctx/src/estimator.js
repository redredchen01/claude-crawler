// Token estimation ratios (chars → tokens, approximate)
const RATIOS = {
  user_message: 0.3, // ~3.3 chars per token
  assistant_response: 0.25, // slightly more efficient
  file_read: 15, // ~15 tokens per line (code averages)
  tool_result: 0.3, // similar to user message
};

const THRESHOLDS = [
  { max: 40, name: "green" },
  { max: 60, name: "yellow" },
  { max: 80, name: "orange" },
  { max: 100, name: "red" },
];

class ContextEstimator {
  constructor({ maxTokens = 200_000 } = {}) {
    this.maxTokens = maxTokens;
    this._usedTokens = 0;
    this._events = [];
    this._checkpointed = new Set();
  }

  trackEvent(type, data) {
    if (!(type in RATIOS)) {
      throw new Error(`Unknown event type: ${type}`);
    }

    let tokens;
    if (type === "file_read") {
      tokens = (data.lines || 0) * RATIOS.file_read;
    } else {
      tokens = (data.chars || 0) * RATIOS[type];
    }

    this._usedTokens += tokens;
    this._events.push({ type, tokens, timestamp: Date.now() });
  }

  get usedTokens() {
    return this._usedTokens;
  }

  get percentage() {
    return Math.min(100, Math.round((this._usedTokens / this.maxTokens) * 100));
  }

  get threshold() {
    const pct = this.percentage;
    for (const t of THRESHOLDS) {
      if (pct < t.max) return t.name;
    }
    return "red";
  }

  shouldCheckpoint() {
    const t = this.threshold;
    if (t === "green") return false;
    if (this._checkpointed.has(t)) return false;
    this._checkpointed.add(t);
    return true;
  }

  get recommendations() {
    const t = this.threshold;
    if (t === "green") return [];
    const recs = [];
    if (t === "yellow") {
      recs.push("Use targeted line-range read instead of full file read");
      recs.push("Consolidate multiple tool calls into one");
    }
    if (t === "orange" || t === "red") {
      recs.push("Proactively save important context to memory files");
    }
    if (t === "red") {
      recs.push("Consider starting a new session to avoid context loss");
    }
    return recs;
  }

  reset() {
    this._usedTokens = 0;
    this._events = [];
    this._checkpointed.clear();
  }

  toJSON() {
    return {
      usedTokens: this._usedTokens,
      maxTokens: this.maxTokens,
      percentage: this.percentage,
      threshold: this.threshold,
      events: this._events.length,
    };
  }
}

module.exports = { ContextEstimator };
