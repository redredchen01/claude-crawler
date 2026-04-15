const fs = require("fs");
const path = require("path");

const TOKENS_PER_LINE = 15;

// Types that should always be loaded regardless of relevance
const ALWAYS_LOAD_TYPES = ["user", "feedback"];

class MemoryLoader {
  constructor({ memoryDir }) {
    this.memoryDir = memoryDir;
  }

  scanIndex() {
    const indexPath = path.join(this.memoryDir, "MEMORY.md");
    if (!fs.existsSync(indexPath)) return [];

    const content = fs.readFileSync(indexPath, "utf8");
    const entries = [];
    const re = /- \[(.+?)\]\((.+?)\)\s*—\s*(.+)/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      entries.push({
        title: match[1],
        file: match[2],
        description: match[3].trim(),
      });
    }
    return entries;
  }

  rankByRelevance(entries, query) {
    const queryWords = query.toLowerCase().split(/\s+/);

    return entries
      .map((entry) => {
        let score = 0;
        const text = `${entry.title} ${entry.description} ${entry.file}`.toLowerCase();

        // Keyword matching
        for (const word of queryWords) {
          if (word.length < 3) continue;
          if (text.includes(word)) score += 10;
        }

        // Type boosting: user/feedback always relevant
        if (entry.file.startsWith("user_")) score += 5;
        if (entry.file.startsWith("feedback_")) score += 5;

        return { ...entry, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  loadSelective(query, { maxFiles = 3 } = {}) {
    const entries = this.scanIndex();
    if (entries.length === 0) return [];

    const ranked = this.rankByRelevance(entries, query);

    // Always include user and feedback types
    const mustLoad = ranked.filter((e) =>
      ALWAYS_LOAD_TYPES.some((t) => e.file.startsWith(t + "_"))
    );
    const others = ranked.filter(
      (e) => !ALWAYS_LOAD_TYPES.some((t) => e.file.startsWith(t + "_"))
    );

    // Fill remaining slots with highest-ranked others
    const remaining = maxFiles - mustLoad.length;
    const selected = [...mustLoad, ...others.slice(0, Math.max(0, remaining))].slice(0, maxFiles);

    return selected.map((entry) => {
      const filePath = path.join(this.memoryDir, entry.file);
      if (!fs.existsSync(filePath)) return { ...entry, content: null, type: "unknown" };

      const content = fs.readFileSync(filePath, "utf8");
      const typeMatch = content.match(/type:\s*(\w+)/);
      return {
        ...entry,
        content,
        type: typeMatch ? typeMatch[1] : "unknown",
      };
    });
  }

  estimateTokens(filePaths) {
    let total = 0;
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) continue;
      const lines = fs.readFileSync(fp, "utf8").split("\n").length;
      total += lines * TOKENS_PER_LINE;
    }
    return total;
  }
}

module.exports = { MemoryLoader };
