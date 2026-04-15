#!/bin/bash

# agent-context.sh — Auto-inject project context for agents
# Usage: source agent-context.sh
#        agent-context [context|full]

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

# Print compact context (default)
print_context() {
  echo "=== Agent Context Injection ==="
  echo ""

  # Recent decisions (last 3)
  echo "## Recent Decisions"
  if [ -d "$MEMORY_DIR/decisions" ]; then
    ls -t "$MEMORY_DIR/decisions"/*.md 2>/dev/null | head -3 | while read f; do
      echo "- $(basename "$f" | sed 's/.md$//')"
    done
  else
    echo "- No decisions logged yet"
  fi
  echo ""

  # Project conventions
  echo "## Project Conventions"
  if [ -f "$MEMORY_DIR/knowledge/conventions.md" ]; then
    grep -E '^\- |^## ' "$MEMORY_DIR/knowledge/conventions.md" | head -5 || echo "- See knowledge/conventions.md"
  else
    echo "- No conventions set"
  fi
  echo ""

  # Known issues
  echo "## Known Issues"
  if [ -f "$MEMORY_DIR/knowledge/known-issues.md" ]; then
    grep -E '^\- |^## ' "$MEMORY_DIR/knowledge/known-issues.md" | head -5 || echo "- See knowledge/known-issues.md"
  else
    echo "- No issues recorded"
  fi
  echo ""

  # Next tasks
  echo "## Next Tasks"
  if [ -f "$MEMORY_DIR/tasks/tasks.json" ]; then
    grep '"status": "pending"' "$MEMORY_DIR/tasks/tasks.json" | head -3 | sed 's/.*"id": "//; s/".*//' || echo "- No pending tasks"
  else
    echo "- No task graph yet"
  fi
  echo ""
}

# Print full context (with all decisions and knowledge)
print_full() {
  echo "=== Full Project Context ==="
  echo ""

  # All decisions
  if [ -d "$MEMORY_DIR/decisions" ]; then
    echo "## All Decisions"
    ls -t "$MEMORY_DIR/decisions"/*.md 2>/dev/null | while read f; do
      echo ""
      echo "### $(basename "$f" | sed 's/.md$//')"
      sed -n '/^## Decision/,/^##/p' "$f" | head -5
    done
  fi
  echo ""

  # All knowledge bases
  if [ -d "$MEMORY_DIR/knowledge" ]; then
    echo "## Knowledge Base"
    ls "$MEMORY_DIR/knowledge"/*.md 2>/dev/null | while read f; do
      echo ""
      echo "### $(basename "$f" | sed 's/.md$//')"
      head -20 "$f"
    done
  fi
}

# Main
case "${1:-context}" in
  context)
    print_context
    ;;
  full)
    print_full
    ;;
  *)
    print_context
    ;;
esac
