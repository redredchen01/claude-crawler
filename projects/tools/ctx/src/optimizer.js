const LARGE_FILE_THRESHOLD = 200;

class ToolOptimizer {
  constructor() {
    this._calls = [];
    this._searchPatterns = new Map();
  }

  recordToolCall(type, meta = {}) {
    this._calls.push({ type, meta, timestamp: Date.now() });

    if (type === "Grep" && meta.pattern) {
      const count = this._searchPatterns.get(meta.pattern) || 0;
      this._searchPatterns.set(meta.pattern, count + 1);
    }
  }

  get totalCalls() {
    return this._calls.length;
  }

  callsByType(type) {
    return this._calls.filter((c) => c.type === type).length;
  }

  detectPatterns() {
    const patterns = [];

    // Detect sequential single-file reads (3+ in a row)
    let consecutiveReads = 0;
    for (const call of this._calls) {
      if (call.type === "Read") {
        consecutiveReads++;
        if (consecutiveReads >= 3) {
          patterns.push({
            type: "sequential_reads",
            count: consecutiveReads,
            suggestion: "Batch independent file reads into parallel calls",
          });
          break;
        }
      } else {
        consecutiveReads = 0;
      }
    }

    // Detect large full-file reads
    for (const call of this._calls) {
      if (
        call.type === "Read" &&
        call.meta.fullFile &&
        call.meta.lines &&
        call.meta.lines > LARGE_FILE_THRESHOLD
      ) {
        patterns.push({
          type: "large_full_read",
          file: call.meta.file,
          lines: call.meta.lines,
          suggestion: `Use offset+limit to read only needed section of ${call.meta.file} (${call.meta.lines} lines)`,
        });
      }
    }

    // Detect repeated searches
    for (const [pattern, count] of this._searchPatterns) {
      if (count >= 2) {
        patterns.push({
          type: "repeated_search",
          pattern,
          count,
          suggestion: `Pattern "${pattern}" searched ${count} times — cache the result`,
        });
      }
    }

    return patterns;
  }

  suggestions() {
    return this.detectPatterns().map((p) => p.suggestion);
  }

  efficiency() {
    const patterns = this.detectPatterns();
    if (patterns.length === 0) return 100;
    // Each pattern costs ~5% efficiency
    return Math.max(0, 100 - patterns.length * 5);
  }

  reset() {
    this._calls = [];
    this._searchPatterns.clear();
  }
}

module.exports = { ToolOptimizer };
