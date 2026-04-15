const TOKENS_PER_LINE = 15;
const TOKENS_PER_RESPONSE = 600;
const TOKENS_PER_TOOL_CALL = 1500;

class TaskPlanner {
  constructor({ maxTokens = 200_000, usedTokens = 0 }) {
    this.maxTokens = maxTokens;
    this.usedTokens = usedTokens;
  }

  get remainingTokens() {
    return Math.max(0, this.maxTokens - this.usedTokens);
  }

  estimate({ filesToRead = [], expectedResponses = 0, expectedToolCalls = 0 }) {
    const fileReads = filesToRead.reduce((sum, f) => sum + (f.lines || 0) * TOKENS_PER_LINE, 0);
    const responses = expectedResponses * TOKENS_PER_RESPONSE;
    const toolCalls = expectedToolCalls * TOKENS_PER_TOOL_CALL;
    const totalTokens = fileReads + responses + toolCalls;

    return {
      totalTokens,
      breakdown: { fileReads, responses, toolCalls },
      files: filesToRead,
    };
  }

  fits(estimation) {
    return estimation.totalTokens <= this.remainingTokens;
  }

  suggest(estimation) {
    if (this.fits(estimation)) return [];

    const suggestions = [];
    const overage = estimation.totalTokens - this.remainingTokens;

    if (estimation.files.length > 2) {
      suggestions.push(
        `Task needs ~${Math.round(estimation.totalTokens / 1000)}K tokens but only ~${Math.round(this.remainingTokens / 1000)}K left. Read only the most critical ${Math.min(2, estimation.files.length)} files first.`
      );
    }

    if (overage > this.remainingTokens * 0.5) {
      suggestions.push("Consider splitting this task across 2 sessions.");
    }

    if (estimation.breakdown.fileReads > estimation.totalTokens * 0.5) {
      suggestions.push("Use line-range reads to reduce file read tokens.");
    }

    return suggestions;
  }

  formatReport(estimation) {
    const lines = [
      `Task budget: ~${Math.round(estimation.totalTokens / 1000)}K tokens`,
      `  File reads: ${estimation.files.map((f) => f.path).join(", ")} (~${Math.round(estimation.breakdown.fileReads / 1000)}K)`,
      `  Responses: ~${Math.round(estimation.breakdown.responses / 1000)}K`,
      `  Tool calls: ~${Math.round(estimation.breakdown.toolCalls / 1000)}K`,
      `Context remaining: ~${Math.round(this.remainingTokens / 1000)}K tokens`,
      this.fits(estimation) ? "✅ Fits in current session" : "⚠️ May not fit — consider splitting",
    ];
    return lines.join("\n");
  }
}

module.exports = { TaskPlanner };
