#!/bin/bash
# scripts/agent/bootstrap.sh — Agent Mode Startup Ritual
# Automates the startup ritual defined in AGENT_ROUTINE.md

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

log_info "🌅 Starting Agent Startup Ritual..."

# 1. Task Scan
if [ -f "$WORKSPACE_ROOT/scripts/agent/agent-tasks.sh" ]; then
  log_info "📋 Current Priority Tasks:"
  bash "$WORKSPACE_ROOT/scripts/agent/agent-tasks.sh" next || true
else
  log_warn "agent-tasks.sh not found, skipping task scan."
fi

# 2. Project Status & Context Snapshot
log_info "🧠 Compacting Context..."

# Step 2.1: Refresh Activity Feed
if [ -f "$WORKSPACE_ROOT/scripts/agent/activity-feed-gen.sh" ]; then
  bash "$WORKSPACE_ROOT/scripts/agent/activity-feed-gen.sh"
fi

if [ -f "$WORKSPACE_ROOT/scripts/agent/context-snapshot-gen.sh" ]; then
  bash "$WORKSPACE_ROOT/scripts/agent/context-snapshot-gen.sh"
  
  # Step 2.5: Prune Intelligence
  if [ -f "$WORKSPACE_ROOT/scripts/agent/intelligence-pruner.sh" ]; then
    bash "$WORKSPACE_ROOT/scripts/agent/intelligence-pruner.sh"
  fi
  
  echo "---"
  cat "$WORKSPACE_ROOT/.current_context.md"
  echo "---"
else
  log_info "📖 Reading PROJECTS_INFO.md..."
  head -n 20 "$WORKSPACE_ROOT/PROJECTS_INFO.md"
fi

# 3. Health Check (Conditional - once per session or day)
# For now, we just list the command
log_info "💡 Ready to run 'agent-check' if needed."

log_info "✅ Startup Ritual Complete. How can I help you today?"
