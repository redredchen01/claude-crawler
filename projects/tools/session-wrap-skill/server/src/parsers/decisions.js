const fs = require('fs');
const path = require('path');
const { MEMORY_DIR } = require('../config');

const DECISIONS_DIR = path.join(MEMORY_DIR, 'decisions');

function parseDecisionFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const filename = path.basename(filepath, '.md');

  // Extract date and topic from filename: YYYY-MM-DD-topic
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const fileDate = dateMatch ? dateMatch[1] : filename;
  const fileTopic = dateMatch ? dateMatch[2] : filename;

  // Split on entry boundaries: ## [HH:MM]
  const entries = content.split(/(?=^## \[\d{2}:\d{2}\])/m).filter(s => s.trim());
  const decisions = [];

  for (const entry of entries) {
    const headerMatch = entry.match(/^## \[(\d{2}:\d{2})\]\s*(.+)/m);
    if (!headerMatch) continue;

    const time = headerMatch[1];
    const agent = headerMatch[2].trim();

    const decisionMatch = entry.match(/\*\*Decision:\*\*\s*(.+?)(?=\n\n|\n\*\*|$)/s);
    const reasoningMatch = entry.match(/\*\*Reasoning:\*\*\s*(.+?)(?=\n\n|\n\*\*|$)/s);
    const tradeoffsMatch = entry.match(/\*\*Trade-offs:\*\*\s*(.+?)(?=\n\n|\n##|$)/s);

    decisions.push({
      id: `${fileDate}-${fileTopic}-${time}`.replace(/[: ]/g, '-'),
      date: `${fileDate}T${time}:00Z`,
      agent: agent.toLowerCase(),
      topic: fileTopic.replace(/-/g, ' '),
      decision: decisionMatch ? decisionMatch[1].trim() : '',
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
      trade_offs: tradeoffsMatch ? tradeoffsMatch[1].trim() : undefined,
    });
  }

  return decisions;
}

function readDecisions(filters = {}) {
  if (!fs.existsSync(DECISIONS_DIR)) return [];

  const files = fs.readdirSync(DECISIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  let all = [];
  for (const file of files) {
    try {
      const decisions = parseDecisionFile(path.join(DECISIONS_DIR, file));
      all = all.concat(decisions);
    } catch {
      // Skip malformed files
    }
  }

  // Apply filters
  if (filters.q) {
    const q = filters.q.toLowerCase();
    all = all.filter(d =>
      d.topic.toLowerCase().includes(q) ||
      d.decision.toLowerCase().includes(q) ||
      d.reasoning.toLowerCase().includes(q)
    );
  }

  if (filters.agent) {
    const agent = filters.agent.toLowerCase();
    all = all.filter(d => d.agent.includes(agent));
  }

  if (filters.start_date) {
    all = all.filter(d => d.date >= filters.start_date);
  }

  if (filters.end_date) {
    all = all.filter(d => d.date <= filters.end_date + 'T23:59:59Z');
  }

  return all;
}

module.exports = { readDecisions, parseDecisionFile };
