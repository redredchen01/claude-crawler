#!/bin/bash
set -u

# L4 Weekly Governance Orchestrator
# Runs retro-gen → metrics-rollup → archive-cleanup
# Cron: 0 0 * * 0 (Sundays at 00:00 UTC)

WORKSPACE="/Users/dex/YD 2026"
cd "$WORKSPACE"

WEEK=$(date "+%Y-W%U")
LOG_DIR="$HOME/.claude/automation-logs"
LOG_FILE="$LOG_DIR/l4-weekly-${WEEK}.log"

mkdir -p "$LOG_DIR"

# Logging helper (to stderr to avoid interfering with stdout captures)
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$1] $2" >&2
}

# Task runner with timeout + pass/fail tracking
run_task() {
  local script=$1
  local timeout=$2
  local name=$(basename "$script" .sh)

  log "INFO" "Starting $name (timeout: ${timeout}s)..."
  if timeout "$timeout" bash "$script" >> "$LOG_FILE" 2>&1; then
    echo "pass"
  else
    echo "fail"
  fi
}

# Initialize
log "INFO" "L4 Weekly Governance started"

PASSED=0
FAILED=0

# Task 1: Retro generation (180s)
if [ "$(run_task scripts/agent/retro-gen.sh 180)" = "pass" ]; then
  log "INFO" "✅ retro-gen passed"
  PASSED=$((PASSED + 1))
else
  log "WARN" "❌ retro-gen failed"
  FAILED=$((FAILED + 1))
fi

# Task 2: Metrics rollup (120s)
if [ "$(run_task scripts/agent/metrics-rollup.sh 120)" = "pass" ]; then
  log "INFO" "✅ metrics-rollup passed"
  PASSED=$((PASSED + 1))
else
  log "WARN" "❌ metrics-rollup failed"
  FAILED=$((FAILED + 1))
fi

# Task 3: Archive cleanup (60s, P2 - soft-fail)
if [ "$(run_task scripts/agent/archive-cleanup.sh 60)" = "pass" ]; then
  log "INFO" "✅ archive-cleanup passed"
  PASSED=$((PASSED + 1))
else
  log "WARN" "⚠️  archive-cleanup failed (optional)"
fi

# Completion
log "INFO" "L4 Weekly Governance completed: $PASSED passed, $FAILED failed"

if [ $PASSED -ge 2 ]; then
  log "INFO" "✅ Success (>= 2 P1 tasks passed)"
  exit 0
else
  log "ERROR" "❌ Failed (< 2 P1 tasks passed)"
  exit 1
fi
