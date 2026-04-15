#!/bin/bash

# agent-checkpoint.sh — Checkpoint and rollback system
# Usage: agent-checkpoint save [label]
#        agent-checkpoint list
#        agent-checkpoint restore <id>
#        agent-checkpoint diff <id>

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

CHECKPOINTS_DIR="$MEMORY_DIR/checkpoints"
ensure_dir "$CHECKPOINTS_DIR"
MANIFEST="$CHECKPOINTS_DIR/manifest.json"

# Initialize manifest if not exists
if [ ! -f "$MANIFEST" ]; then
  echo '{"checkpoints": {}}' > "$MANIFEST"
fi

# Save a checkpoint
cmd_save() {
  local label="${1:-Auto-checkpoint}"
  local timestamp=$(date +%s)
  local id=$(date +%Y%m%d-%H%M%S)
  local snapshot_file="$CHECKPOINTS_DIR/$id.snapshot"

  # Create a snapshot of current git state
  cd "$WORKSPACE"
  git status > "$snapshot_file" 2>&1
  git diff HEAD >> "$snapshot_file" 2>&1 || true

  # Update manifest
  local tmp_manifest=$(mktemp)
  cat "$MANIFEST" | sed "s/\"checkpoints\": {/\"checkpoints\": {\"$id\": {\"label\": \"$label\", \"timestamp\": $timestamp},/" > "$tmp_manifest"
  mv "$tmp_manifest" "$MANIFEST"

  echo "✅ Checkpoint saved: $id"
  echo "   Label: $label"
  echo "   File: $snapshot_file"
}

# List checkpoints
cmd_list() {
  echo "📸 Saved Checkpoints:"
  if [ ! -f "$MANIFEST" ]; then
    echo "   (none yet)"
    return
  fi

  grep -o '"[0-9]\{8\}-[0-9]\{6\}"' "$MANIFEST" | sed 's/"//g' | while read id; do
    label=$(grep -o "\"$id\": {\"label\": \"[^\"]*" "$MANIFEST" | sed 's/.*"label": "//' | head -1)
    age=$(date -r "$CHECKPOINTS_DIR/$id.snapshot" +%Y-%m-%d\ %H:%M 2>/dev/null || echo "unknown")
    echo "   - $id: $label [$age]"
  done
}

# Restore a checkpoint (dry-run only, shows what would change)
cmd_restore() {
  local id="$1"

  if [ -z "$id" ]; then
    echo "❌ Usage: agent-checkpoint restore <id>"
    exit 1
  fi

  if [ ! -f "$CHECKPOINTS_DIR/$id.snapshot" ]; then
    echo "❌ Checkpoint not found: $id"
    exit 1
  fi

  echo "⚠️  To restore checkpoint $id:"
  echo "   1. git reset HEAD~N  (replace N with number of commits since checkpoint)"
  echo "   2. git checkout <branch>  (to discard local changes)"
  echo ""
  echo "Snapshot saved at: $CHECKPOINTS_DIR/$id.snapshot"
  echo "Review with: git diff $CHECKPOINTS_DIR/$id.snapshot"
}

# Show diff since checkpoint
cmd_diff() {
  local id="$1"

  if [ -z "$id" ]; then
    echo "❌ Usage: agent-checkpoint diff <id>"
    exit 1
  fi

  if [ ! -f "$CHECKPOINTS_DIR/$id.snapshot" ]; then
    echo "❌ Checkpoint not found: $id"
    exit 1
  fi

  echo "📊 Changes since checkpoint $id:"
  tail -50 "$CHECKPOINTS_DIR/$id.snapshot"
}

# Main dispatch
case "${1:-}" in
  save)
    cmd_save "$2"
    ;;
  list)
    cmd_list
    ;;
  restore)
    cmd_restore "$2"
    ;;
  diff)
    cmd_diff "$2"
    ;;
  *)
    echo "Usage:"
    echo "  agent-checkpoint save [label]      — create checkpoint"
    echo "  agent-checkpoint list              — list all checkpoints"
    echo "  agent-checkpoint restore <id>      — restore a checkpoint"
    echo "  agent-checkpoint diff <id>         — show changes since checkpoint"
    exit 1
    ;;
esac
