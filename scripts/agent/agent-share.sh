#!/bin/bash

# agent-share.sh — Cross-agent memory sharing
# Usage: agent-share write <agent-id> <file>
#        agent-share read <agent-id>
#        agent-share list
#        agent-share clean

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

AGENTS_DIR="$MEMORY_DIR/agents"
ensure_dir "$AGENTS_DIR"

# Write agent state (publish)
cmd_write() {
  local agent_id="$1"
  local file="$2"

  if [ -z "$agent_id" ] || [ -z "$file" ]; then
    echo "❌ Usage: agent-share write <agent-id> <file>"
    exit 1
  fi

  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    exit 1
  fi

  local dest="$AGENTS_DIR/${agent_id}-state.md"
  cp "$file" "$dest"
  echo "✅ Published state for $agent_id to $dest"
}

# Read agent state (consume)
cmd_read() {
  local agent_id="$1"

  if [ -z "$agent_id" ]; then
    echo "❌ Usage: agent-share read <agent-id>"
    exit 1
  fi

  local src="$AGENTS_DIR/${agent_id}-state.md"

  if [ ! -f "$src" ]; then
    echo "❌ No state found for agent: $agent_id"
    exit 1
  fi

  cat "$src"
}

# List all active agents
cmd_list() {
  echo "🤖 Active Agent States:"
  if [ ! -d "$AGENTS_DIR" ] || [ -z "$(ls -A "$AGENTS_DIR" 2>/dev/null)" ]; then
    echo "   (none)"
    return
  fi

  ls -t "$AGENTS_DIR"/*-state.md 2>/dev/null | while read f; do
    agent_id=$(basename "$f" | sed 's/-state.md$//')
    age=$(date +%s -r "$f")
    now=$(date +%s)
    diff=$((now - age))
    hours=$((diff / 3600))
    echo "   - $agent_id (${hours}h ago)"
  done
}

# Clean old states (>24h)
cmd_clean() {
  local cutoff=$((24 * 3600))  # 24 hours in seconds
  local now=$(date +%s)

  echo "🧹 Cleaning old agent states..."
  if [ ! -d "$AGENTS_DIR" ] || [ -z "$(ls -A "$AGENTS_DIR" 2>/dev/null)" ]; then
    echo "   (nothing to clean)"
    return
  fi

  local count=0
  ls "$AGENTS_DIR"/*-state.md 2>/dev/null | while read f; do
    age=$(date +%s -r "$f")
    diff=$((now - age))
    if [ $diff -gt $cutoff ]; then
      rm "$f"
      count=$((count + 1))
      agent_id=$(basename "$f" | sed 's/-state.md$//')
      echo "   ✓ Removed stale state: $agent_id"
    fi
  done
}

# Main dispatch
case "${1:-}" in
  write)
    cmd_write "$2" "$3"
    ;;
  read)
    cmd_read "$2"
    ;;
  list)
    cmd_list
    ;;
  clean)
    cmd_clean
    ;;
  *)
    echo "Usage:"
    echo "  agent-share write <agent-id> <file>   — publish agent state"
    echo "  agent-share read <agent-id>          — read another agent's state"
    echo "  agent-share list                      — list active agents"
    echo "  agent-share clean                     — remove stale states (>24h)"
    exit 1
    ;;
esac
