#!/bin/bash
# Vault Mining Scheduler — automated Obsidian insight extraction
#
# Runs weekly (Sunday 07:00 UTC) to extract insights, analyze code patterns,
# recommend top skills by ROI, generate reports, and feed skill-factory queue.
#
# Crontab setup:
#   0 7 * * 0 /Users/dex/YD\ 2026/scripts/vault-mining-scheduler.sh
#
# Environment variables:
#   OA_VAULT     — override vault path (default: ~/YD 2026/obsidian)
#   VAULT_OUTPUT — override reports output dir

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
CLAUSIDIAN_DIR="$WORKSPACE_ROOT/projects/tools/clausidian"
VAULT_PATH="${OA_VAULT:-$WORKSPACE_ROOT/obsidian}"
REPORTS_DIR="${VAULT_OUTPUT:-$WORKSPACE_ROOT/docs/reports/vault-mining}"
QUEUE_FILE="$WORKSPACE_ROOT/docs/skill-factory/queue.md"
LOG_FILE="$REPORTS_DIR/vault-mining.log"
REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="$REPORTS_DIR/report-$REPORT_DATE.md"
JSON_FILE="$REPORTS_DIR/report-$REPORT_DATE.json"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

die() {
  log "ERROR: $1"
  exit 1
}

# Setup directories
mkdir -p "$REPORTS_DIR" "$(dirname "$QUEUE_FILE")"

log "=== Vault Mining Pipeline Started ==="
log "Vault: $VAULT_PATH"
log "Output: $REPORTS_DIR"

# Verify Node.js and vault existence
command -v node >/dev/null 2>&1 || die "node not found in PATH"
[ -d "$VAULT_PATH" ] || die "Vault not found: $VAULT_PATH"
[ -d "$CLAUSIDIAN_DIR" ] || die "Clausidian not found: $CLAUSIDIAN_DIR"

# Run the pipeline via Node.js inline script
log "Running vault mining pipeline..."

node --input-type=module <<'EOF'
import { extractInsights } from './projects/tools/clausidian/src/insight-extractor.mjs';
import { analyzeCodePatterns } from './projects/tools/clausidian/src/code-pattern-analyzer.mjs';
import { recommendSkills, generateReport, generateJSONReport } from './projects/tools/clausidian/src/skill-recommender.mjs';
import { loadVaultNotes } from './projects/tools/clausidian/src/insight-extractor.mjs';
import { writeFileSync } from 'fs';

const vaultPath = './obsidian';
const reportDate = new Date().toISOString().split('T')[0];
const reportFile = `./docs/reports/vault-mining/report-${reportDate}.md`;
const jsonFile = `./docs/reports/vault-mining/report-${reportDate}.json`;

try {
  console.error('Loading vault notes...');
  const insights = await extractInsights(vaultPath, { maxCandidates: 50 });
  console.error(`Loaded ${insights.metadata.totalNotes} notes, found ${insights.metadata.filtered} relevant`);

  const notes = loadVaultNotes(vaultPath);
  const patterns = analyzeCodePatterns(notes, { topN: 15 });
  console.error(`Analyzed ${patterns.totalPatterns} code patterns`);

  const result = recommendSkills(insights, patterns, { topN: 10 });
  console.error(`Generated ${result.skills.length} skill recommendations`);

  const report = generateReport(result.skills, insights.metadata);
  writeFileSync(reportFile, report, 'utf8');
  console.error(`Report written: ${reportFile}`);

  const json = generateJSONReport(result);
  writeFileSync(jsonFile, json, 'utf8');
  console.error(`JSON written: ${jsonFile}`);

  // Print top 5 to stdout for Slack/notification integration
  console.log('TOP SKILLS:');
  for (const s of result.skills.slice(0, 5)) {
    console.log(`  ${s.rank}. ${s.skill} (Quality: ${s.score}/10, Complexity: ${s.complexity}/10, ${s.riskLevel} risk)`);
  }
} catch (err) {
  console.error('Pipeline error:', err.message);
  process.exit(1);
}
EOF

log "Pipeline output written to $REPORT_FILE"

# Append top skills to skill-factory queue
if [ -f "$REPORT_FILE" ]; then
  log "Updating skill-factory queue..."
  {
    echo ""
    echo "## Vault Mining Batch — $REPORT_DATE"
    grep -E '^\d+\.' "$REPORT_FILE" | head -5 || true
    echo ""
  } >> "$QUEUE_FILE"
  log "Queue updated: $QUEUE_FILE"
fi

log "=== Vault Mining Pipeline Complete ==="
log "Report: $REPORT_FILE"
