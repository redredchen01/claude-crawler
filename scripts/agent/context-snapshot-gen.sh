#!/bin/bash
# scripts/agent/context-snapshot-gen.sh — Phase 4 Semantic Context Compactor
# Generates a focused context snapshot based on recent activity and priority tasks.

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"
source "$WORKSPACE_ROOT/scripts/lib/cache.sh"

SNAPSHOT_FILE="$WORKSPACE_ROOT/.current_context.md"
FEED_FILE="$WORKSPACE_ROOT/obsidian/projects/workspace-docs/ACTIVITY_FEED.md"
TASK_LIST="$WORKSPACE_ROOT/PROJECTS_INFO.md"

log_info "🧠 Generating Intelligent Context Snapshot..."

{
  echo "# 🧠 Current Agent Context Snapshot"
  echo "*Auto-generated on $(date +'%Y-%m-%d %H:%M:%S')*"
  echo ""
  
  # 1. Capture Active Mission
  echo "## 🎯 Active Mission"
  MISSION=$(grep "\- \[ \]" "$TASK_LIST" 2>/dev/null | head -n 1 | sed 's/- \[ \] //' || echo "")
  if [ -z "$MISSION" ]; then
    MISSION="Workspace Maintenance & Evolution (Phase 4)"
  fi
  echo "> $MISSION"
  echo ""

  # 2. Recent Evolution (Last 5 Activities)
  echo "## 🕒 Recent Evolution"
  if [ -f "$FEED_FILE" ]; then
    grep "✅" "$FEED_FILE" 2>/dev/null | tail -n 5 | sed 's/^/  /' || echo "  (Activities pending sync)"
  else
    echo "  (Feed not found at $FEED_FILE)"
  fi
  echo ""

  # 3. Relevant Documentation (Semantic Heuristics)
  echo "## 📖 Relevant Protocols & Docs"
  # Heuristics: Always include Core SOP, then dynamic based on mission
  echo "- [[AGENT_ROUTINE.md]] (Core SOP)"
  echo "- [[PROJECTS_INFO.md]] (Project Index)"
  
  if [[ "$MISSION" == *"VWRS"* ]]; then
    echo "- [[VWRS_ARCHITECTURE.md]] (Domain Knowledge)"
  fi
  if [[ "$MISSION" == *"Infra"* ]] || [[ "$MISSION" == *"Phase 4"* ]]; then
    echo "- [[ARCHITECTURE.md]] (System Design)"
  fi
  echo ""

  # 4. Performance Baseline
  echo "## 📊 System Health"
  METRICS_FILE="/tmp/workspace_metrics.jsonl"
  if [ -f "$METRICS_FILE" ]; then
    # Grab the last line, check if it's a valid JSON object with 'name'
    LAST_WF=$(tail -n 20 "$METRICS_FILE" | grep "workflow_run" | tail -n 1 || echo "")
    if [ -n "$LAST_WF" ] && echo "$LAST_WF" | jq -e . >/dev/null 2>&1; then
      WF_NAME=$(echo "$LAST_WF" | jq -r '.name // "unknown"')
      WF_DUR=$(echo "$LAST_WF" | jq -r '.value // 0')
      echo "  • Last Workflow: \`$WF_NAME\` (${WF_DUR}s)"
    else
      echo "  • System Metrics: 🟢 Calibrating..."
    fi
  fi
  
  echo ""
  echo "---"
  echo "*Hint: Use this snapshot to focus on current high-value tasks.*"
} > "$SNAPSHOT_FILE"

log_info "✅ Context Snapshot generated: $SNAPSHOT_FILE"
