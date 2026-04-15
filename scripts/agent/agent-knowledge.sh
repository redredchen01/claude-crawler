#!/bin/bash

# agent-knowledge.sh — Project knowledge base management
# Usage: agent-knowledge set <topic> <content>
#        agent-knowledge get <topic>
#        agent-knowledge list
#        agent-knowledge context

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

KNOWLEDGE_DIR="$MEMORY_DIR/knowledge"
ensure_dir "$KNOWLEDGE_DIR"

# Initialize default knowledge files if not exist
init_defaults() {
  local topics=("conventions" "architecture" "known-issues" "tech-stack")
  for topic in "${topics[@]}"; do
    local file="$KNOWLEDGE_DIR/$topic.md"
    if [ ! -f "$file" ]; then
      {
        echo "---"
        echo "topic: $topic"
        echo "created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "---"
        echo ""
        echo "# $topic"
        echo ""
        echo "## Overview"
        echo "Add content here..."
        echo ""
      } > "$file"
    fi
  done
}

init_defaults

# Set/update knowledge
cmd_set() {
  local topic="$1"
  local content="$2"

  if [ -z "$topic" ]; then
    echo "❌ Usage: agent-knowledge set <topic> <content>"
    exit 1
  fi

  local file="$KNOWLEDGE_DIR/$topic.md"

  # Create file if not exists
  if [ ! -f "$file" ]; then
    {
      echo "---"
      echo "topic: $topic"
      echo "created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "---"
      echo ""
      echo "# $topic"
      echo ""
    } > "$file"
  fi

  # Append content
  {
    echo "## Update: $(date +%Y-%m-%d\ %H:%M)"
    echo "$content"
    echo ""
  } >> "$file"

  echo "✅ Updated $topic"
}

# Get knowledge
cmd_get() {
  local topic="$1"

  if [ -z "$topic" ]; then
    echo "❌ Usage: agent-knowledge get <topic>"
    exit 1
  fi

  local file="$KNOWLEDGE_DIR/$topic.md"

  if [ ! -f "$file" ]; then
    echo "❌ Topic not found: $topic"
    exit 1
  fi

  cat "$file"
}

# List all topics
cmd_list() {
  echo "📚 Knowledge Base Topics:"
  if [ -z "$(ls -A "$KNOWLEDGE_DIR" 2>/dev/null)" ]; then
    echo "   (none yet)"
    return
  fi

  ls -1 "$KNOWLEDGE_DIR"/*.md 2>/dev/null | while read f; do
    topic=$(basename "$f" | sed 's/.md$//')
    lines=$(wc -l < "$f")
    echo "   - $topic ($lines lines)"
  done
}

# Print context summary (for agent-context.sh)
cmd_context() {
  echo "## Project Knowledge"
  ls -1 "$KNOWLEDGE_DIR"/*.md 2>/dev/null | while read f; do
    topic=$(basename "$f" | sed 's/.md$//')
    echo ""
    echo "### $topic"
    # Print first section after header
    sed -n '/^## /,/^## /p' "$f" | head -5
  done
}

# Main dispatch
case "${1:-}" in
  set)
    cmd_set "$2" "$3"
    ;;
  get)
    cmd_get "$2"
    ;;
  list)
    cmd_list
    ;;
  context)
    cmd_context
    ;;
  *)
    echo "Usage:"
    echo "  agent-knowledge set <topic> <content>  — set/update knowledge"
    echo "  agent-knowledge get <topic>            — read knowledge"
    echo "  agent-knowledge list                   — list all topics"
    echo "  agent-knowledge context                — print context summary"
    exit 1
    ;;
esac
