#!/bin/bash
set -u
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly LOGS_DIR="${HOME}/.claude/automation-logs"
readonly LOG_FILE="$LOGS_DIR/l3-daily-$(date '+%Y-%m-%d').log"

mkdir -p "$LOGS_DIR"

log() {
  local level="$1"; shift
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] [$level] $*" | tee -a "$LOG_FILE"
}

run_task() {
  local task_name="$1"
  local script_path="$2"
  local timeout="${3:-60}"

  log "INFO" "▶️  Starting: $task_name"
  [ ! -f "$script_path" ] && { log "ERROR" "❌ Not found: $script_path"; return 1; }
  
  if timeout "$timeout" bash "$script_path" >> "$LOG_FILE" 2>&1; then
    log "INFO" "✅ Completed: $task_name"
    return 0
  else
    log "WARN" "⏱️  Task failed/timeout: $task_name"
    return 1
  fi
}

main() {
  log "INFO" "╔═══════════════════════════════════════════════════════════╗"
  log "INFO" "║         Automation L3: Daily Tasks Orchestrator           ║"
  log "INFO" "╚═══════════════════════════════════════════════════════════╝"

  local passed=0 failed=0
  
  run_task "Activity Feed Generation" "$SCRIPT_DIR/activity-feed-gen.sh" 60 && ((passed++)) || ((failed++))
  run_task "Health Audit" "$SCRIPT_DIR/health-audit.sh" 120 && ((passed++)) || ((failed++))
  run_task "KB Refresh (optional)" "$SCRIPT_DIR/kb-refresh.sh" 180 && ((passed++)) || ((failed++))

  log "INFO" "║  Total: 3  |  Passed: $passed  |  Failed: $failed              ║"
  [ $passed -ge 2 ] && return 0 || return 1
}

main "$@"
