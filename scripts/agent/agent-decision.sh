#!/bin/bash

# agent-decision.sh — Decision logging with reasoning chain
# Usage: agent-decision log <topic> <decision> <reasoning>
#        agent-decision list
#        agent-decision search <keyword>

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

DECISIONS_DIR="$MEMORY_DIR/decisions"
ensure_dir "$DECISIONS_DIR"

# Log a decision
cmd_log() {
  local topic="$1"
  local decision="$2"
  local reasoning="$3"

  if [ -z "$topic" ] || [ -z "$decision" ] || [ -z "$reasoning" ]; then
    echo "❌ Usage: agent-decision log <topic> <decision> <reasoning>"
    exit 1
  fi

  local agent=$(detect_agent_type)
  local date=$(date +%Y-%m-%d)
  local time=$(date +%H:%M)
  local filename="$DECISIONS_DIR/${date}-${topic}.md"

  # Append to decision file
  {
    echo ""
    echo "## [$time] $(echo "$agent" | tr '[:lower:]' '[:upper:]')"
    echo ""
    echo "**Decision:** $decision"
    echo ""
    echo "**Reasoning:** $reasoning"
    echo ""
    echo "**Trade-offs:**"
    echo "- (none documented yet)"
  } >> "$filename"

  echo "✅ Logged decision to $(basename $filename)"
}

# List recent decisions
cmd_list() {
  echo "📋 Recent Decisions:"
  if [ ! -d "$DECISIONS_DIR" ] || [ -z "$(ls -A "$DECISIONS_DIR" 2>/dev/null)" ]; then
    echo "   (none yet)"
    return
  fi

  ls -t "$DECISIONS_DIR"/*.md 2>/dev/null | while read f; do
    echo ""
    echo "### $(basename "$f" | sed 's/.md$//')"
    # Show last decision from file
    tac "$f" | grep -A 5 '^##' | head -6
  done
}

# Search decisions
cmd_search() {
  local keyword="$1"

  if [ -z "$keyword" ]; then
    echo "❌ Usage: agent-decision search <keyword>"
    exit 1
  fi

  echo "🔍 Searching for: $keyword"
  if [ ! -d "$DECISIONS_DIR" ]; then
    echo "   (no decisions yet)"
    return
  fi

  grep -r "$keyword" "$DECISIONS_DIR" 2>/dev/null | head -10 || echo "   (no matches)"
}

# Main dispatch
case "${1:-}" in
  log)
    cmd_log "$2" "$3" "$4"
    ;;
  list)
    cmd_list
    ;;
  search)
    cmd_search "$2"
    ;;
  *)
    echo "Usage:"
    echo "  agent-decision log <topic> <decision> <reasoning>  — log a decision"
    echo "  agent-decision list                                — list recent decisions"
    echo "  agent-decision search <keyword>                    — search decisions"
    exit 1
    ;;
esac
