const TOKENS_PER_LINE = 15;

class FileReadTracker {
  constructor() {
    this._files = new Map(); // path → { reads: [{lines, range}], totalLines }
    this._wastedTokens = 0;
  }

  record(filepath, { lines, range }) {
    if (!this._files.has(filepath)) {
      this._files.set(filepath, { reads: [], totalLines: 0 });
    }
    const entry = this._files.get(filepath);
    entry.reads.push({ lines, range });
    entry.totalLines += lines;
  }

  recordDuplicate(filepath, { lines }) {
    this._wastedTokens += lines * TOKENS_PER_LINE;
    this.record(filepath, { lines, range: null });
  }

  has(filepath) {
    return this._files.has(filepath);
  }

  readCount(filepath) {
    const entry = this._files.get(filepath);
    return entry ? entry.reads.length : 0;
  }

  get totalLinesRead() {
    let total = 0;
    for (const [, entry] of this._files) {
      total += entry.totalLines;
    }
    return total;
  }

  isDuplicate(filepath, { range }) {
    if (!this._files.has(filepath)) return false;

    const entry = this._files.get(filepath);
    for (const read of entry.reads) {
      // Previous full read covers everything
      if (read.range === null) return true;

      // Check if requested range is within a previous range read
      if (range && read.range) {
        const [reqStart, reqEnd] = range;
        const [prevStart, prevEnd] = read.range;
        if (reqStart >= prevStart && reqEnd <= prevEnd) return true;
      }
    }

    return false;
  }

  get wastedTokens() {
    return this._wastedTokens;
  }

  suggestion(filepath) {
    if (!this._files.has(filepath)) return null;
    const entry = this._files.get(filepath);
    const count = entry.reads.length;
    return `${filepath} already read ${count}x. Reference memory instead of re-reading.`;
  }

  summary() {
    let totalReads = 0;
    let duplicateReads = 0;

    for (const [, entry] of this._files) {
      totalReads += entry.reads.length;
      if (entry.reads.length > 1) {
        duplicateReads += entry.reads.length - 1;
      }
    }

    return {
      filesRead: this._files.size,
      totalReads,
      duplicateReads,
      wastedTokens: this._wastedTokens,
    };
  }

  toTable() {
    if (this._files.size === 0) return "";

    const lines = ["| File | Reads | Lines | Range |", "|------|-------|-------|-------|"];
    for (const [filepath, entry] of this._files) {
      const lastRead = entry.reads[entry.reads.length - 1];
      const rangeStr = lastRead.range ? `${lastRead.range[0]}-${lastRead.range[1]}` : "full";
      lines.push(`| ${filepath} | ${entry.reads.length} | ${entry.totalLines} | ${rangeStr} |`);
    }
    return lines.join("\n");
  }

  reset() {
    this._files.clear();
    this._wastedTokens = 0;
  }
}

module.exports = { FileReadTracker };
