#!/bin/bash

# agent-optimize.sh — Smart memory optimization
# Usage: agent-optimize summarize
#        agent-optimize archive
#        agent-optimize stats
#        agent-optimize prune [--dry-run]

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

# Show memory stats
cmd_stats() {
  echo "📊 Memory Statistics:"
  echo ""

  # Total size
  if [ -d "$MEMORY_DIR" ]; then
    total=$(du -sh "$MEMORY_DIR" 2>/dev/null | cut -f1)
    echo "Total size: $total"
  fi

  echo ""
  echo "Breakdown:"

  # Count files by type
  local sessions=$(ls -1 "$MEMORY_DIR"/session_*_wrap.md 2>/dev/null | wc -l)
  local decisions=$(ls -1 "$MEMORY_DIR"/decisions/*.md 2>/dev/null | wc -l)
  local knowledge=$(ls -1 "$MEMORY_DIR"/knowledge/*.md 2>/dev/null | wc -l)
  local checkpoints=$(ls -1 "$MEMORY_DIR"/checkpoints/*.snapshot 2>/dev/null | wc -l)
  local agents=$(ls -1 "$MEMORY_DIR"/agents/*-state.md 2>/dev/null | wc -l)

  echo "  Sessions:    $sessions"
  echo "  Decisions:   $decisions"
  echo "  Knowledge:   $knowledge"
  echo "  Checkpoints: $checkpoints"
  echo "  Agent states: $agents"

  echo ""
  echo "Last session: $(ls -t "$MEMORY_DIR"/session_*_wrap.md 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'none')"
}

# Archive old sessions (keep last 3)
cmd_archive() {
  echo "📦 Archiving old sessions..."

  if [ ! -d "$MEMORY_DIR" ]; then
    echo "   (memory dir not found)"
    return
  fi

  local sessions=$(ls -t "$MEMORY_DIR"/session_*_wrap.md 2>/dev/null)
  local count=0

  echo "$sessions" | while read f; do
    count=$((count + 1))
    if [ $count -gt 3 ]; then
      # Archive old sessions
      mv "$f" "$ARCHIVE_DIR/" 2>/dev/null || true
      echo "   ✓ Archived $(basename "$f")"
    fi
  done

  echo "✅ Archive complete"
}

# Summarize old sessions (older than 7 days)
cmd_summarize() {
  echo "📋 Summarizing old sessions..."

  if [ ! -d "$MEMORY_DIR" ]; then
    echo "   (memory dir not found)"
    return
  fi

  local cutoff=$((7 * 24 * 3600))  # 7 days
  local now=$(date +%s)
  local count=0

  ls "$MEMORY_DIR"/session_*_wrap.md 2>/dev/null | while read f; do
    age=$(date +%s -r "$f")
    diff=$((now - age))

    if [ $diff -gt $cutoff ]; then
      # Create a summary
      local summary_file=$(echo "$f" | sed 's/_wrap.md/_summary.md/')
      if [ ! -f "$summary_file" ]; then
        {
          echo "# Summary: $(basename "$f" | sed 's/_wrap.md//')"
          echo ""
          echo "**Original:** $(basename "$f")"
          echo "**Summarized:** $(date +%Y-%m-%d)"
          echo ""
          echo "## Original Content"
          head -20 "$f"
          echo ""
          echo "..."
        } > "$summary_file"
        count=$((count + 1))
        echo "   ✓ Summarized $(basename "$f")"
      fi
    fi
  done

  if [ $count -eq 0 ]; then
    echo "   (no old sessions to summarize)"
  fi
}

# Prune duplicates and empty entries
cmd_prune() {
  local dry_run=false
  if [ "$1" = "--dry-run" ]; then
    dry_run=true
  fi

  echo "🧹 Pruning duplicate/empty entries..."

  if [ ! -d "$MEMORY_DIR" ]; then
    echo "   (memory dir not found)"
    return
  fi

  local removed=0

  # Find empty decision files
  find "$MEMORY_DIR/decisions" -name "*.md" -type f 2>/dev/null | while read f; do
    lines=$(wc -l < "$f")
    if [ "$lines" -lt 5 ]; then
      if [ "$dry_run" = false ]; then
        rm "$f"
        removed=$((removed + 1))
        echo "   ✓ Removed empty: $(basename "$f")"
      else
        echo "   [DRY] Would remove: $(basename "$f")"
      fi
    fi
  done

  if [ "$dry_run" = true ]; then
    echo "   (dry-run mode: no changes made)"
  else
    echo "✅ Pruned $removed files"
  fi
}

# Main dispatch
case "${1:-}" in
  stats)
    cmd_stats
    ;;
  archive)
    cmd_archive
    ;;
  summarize)
    cmd_summarize
    ;;
  prune)
    cmd_prune "$2"
    ;;
  *)
    echo "Usage:"
    echo "  agent-optimize stats              — show memory statistics"
    echo "  agent-optimize archive            — archive old sessions (keep last 3)"
    echo "  agent-optimize summarize          — summarize sessions >7 days old"
    echo "  agent-optimize prune [--dry-run]  — remove empty files"
    exit 1
    ;;
esac
