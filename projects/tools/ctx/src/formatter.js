const ICONS = {
  green: "\u{1F7E2}",
  yellow: "\u{1F7E1}",
  orange: "\u{1F7E0}",
  red: "\u{1F534}",
};

class Formatter {
  static statusBar({ percentage, threshold, reads, writes }) {
    const icon = ICONS[threshold] || ICONS.green;
    return `[ctx: ~${percentage}% | ${reads}r ${writes}w | ${icon}]`;
  }

  static checkpointReport({ percentage, threshold, summary, saved, recommendations }) {
    const icon = ICONS[threshold] || ICONS.green;
    const lines = [
      `${icon} Context checkpoint at ~${percentage}%`,
      "",
      summary,
      "",
      `Saved: ${saved} file(s)`,
    ];

    if (recommendations && recommendations.length > 0) {
      lines.push("");
      lines.push("Recommendations:");
      for (const r of recommendations) {
        lines.push(`  - ${r}`);
      }
    }

    return lines.join("\n");
  }

  static healthScore({ fileCount, staleCount, needsCompression, lastUpdated }) {
    let score = 10;

    // Penalize too many files (ideal: 3-5)
    if (fileCount > 10) score -= 3;
    else if (fileCount > 7) score -= 2;
    else if (fileCount > 5) score -= 1;
    if (fileCount === 0) score -= 2;

    // Penalize stale files
    score -= Math.min(3, staleCount);

    // Penalize uncompressed large files
    score -= Math.min(2, needsCompression);

    // Penalize old updates
    if (lastUpdated) {
      const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / 86400000;
      if (daysSince > 14) score -= 2;
      else if (daysSince > 7) score -= 1;
    }

    score = Math.max(0, Math.min(10, score));

    const bar = "\u2588".repeat(score) + "\u2591".repeat(10 - score);
    const display = [
      `Memory health: ${score}/10 [${bar}]`,
      `  Files: ${fileCount} | Stale: ${staleCount} | Needs compression: ${needsCompression}`,
    ].join("\n");

    return { score, display };
  }
}

module.exports = { Formatter };
