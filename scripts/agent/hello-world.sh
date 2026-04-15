#!/bin/bash
# scripts/agent/hello-world.sh — Workspace health greeting skill
# A reference implementation demonstrating agent framework patterns
# @docs [hello-world-guide.md]
# @docs [hello-world.md]

set -eo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

log_info "🚀 Running Skill: hello-world..."

# --- 1. Workspace Detection ---
log_info "📂 Workspace: $WORKSPACE_ROOT"
log_info "🖥️  Platform: $OSTYPE"
log_info "🤖 Agent: $(detect_agent_type)"

# --- 2. Quick Health Checks ---
echo ""
echo "=== Workspace Health ==="

# Git status
cd "$WORKSPACE_ROOT"
BRANCH=$(git branch --show-current 2>/dev/null || echo "N/A")
CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
log_info "🌿 Branch: $BRANCH | Changes: $CHANGES"

# Project count
PROD=$(ls -1d projects/production/*/ 2>/dev/null | wc -l | tr -d ' ')
EXP=$(ls -1d projects/experimental/*/ 2>/dev/null | wc -l | tr -d ' ')
TOOLS=$(ls -1d projects/tools/*/ 2>/dev/null | wc -l | tr -d ' ')
log_info "📊 Projects: $PROD production / $EXP experimental / $TOOLS tools"

# Task status
TASKS_FILE="$WORKSPACE_ROOT/scripts/../../.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
if [ -f "$TASKS_FILE" ]; then
  DONE=$(jq '[.tasks[] | select(.status=="done")] | length' "$TASKS_FILE" 2>/dev/null || echo 0)
  PENDING=$(jq '[.tasks[] | select(.status=="pending")] | length' "$TASKS_FILE" 2>/dev/null || echo 0)
  log_info "📋 Tasks: $DONE done / $PENDING pending"
else
  log_info "📋 Tasks: (no task file found)"
fi

# Memory files
MEMORY_DIR="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"
if [ -d "$MEMORY_DIR" ]; then
  MEM_COUNT=$(ls -1 "$MEMORY_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  log_info "🧠 Memory: $MEM_COUNT files"
fi

# Obsidian vault
VAULT="$WORKSPACE_ROOT/obsidian"
if [ -d "$VAULT" ]; then
  NOTES=$(find "$VAULT" -name "*.md" -not -path "*/\.*" 2>/dev/null | wc -l | tr -d ' ')
  log_info "📝 Obsidian: $NOTES notes"
fi

# --- 3. Report Metric ---
report_metric "skill" "hello-world" 1 "ok" '{"demo": true}' 2>/dev/null || true

# --- Summary ---
echo ""
log_info "✅ hello-world complete — workspace is healthy!"
