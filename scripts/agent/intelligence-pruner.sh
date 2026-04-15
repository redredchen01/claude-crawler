#!/bin/bash
# scripts/agent/intelligence-pruner.sh — Phase 4 Intelligence Pruner
# Aggregates relevant documents into a single 'Hot Context' for immediate agent use.

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

SNAPSHOT_FILE="$WORKSPACE_ROOT/.current_context.md"
HOT_CONTEXT_FILE="$WORKSPACE_ROOT/.hot_context.md"

log_info "✂️ Pruning and Aggregating Intelligence..."

if [ ! -f "$SNAPSHOT_FILE" ]; then
  log_error "Snapshot file not found. Run context-snapshot-gen.sh first."
fi

# Initialize Hot Context
{
  echo "# 🔥 Hot Context: Core Intelligence for Current Mission"
  echo "*Compiled on $(date +'%Y-%m-%d %H:%M:%S')*"
  echo ""
  echo "---"
} > "$HOT_CONTEXT_FILE"

# Extract document links from snapshot (format: [[filename.md]])
RELEVANT_DOCS=$(grep -oE "\[\[.*\.md\]\]" "$SNAPSHOT_FILE" | sed 's/\[\[//; s/\]\]//')

if [ -z "$RELEVANT_DOCS" ]; then
  log_warn "No relevant docs found in snapshot."
  echo "> (No specific protocol context found)" >> "$HOT_CONTEXT_FILE"
else
  for doc in $RELEVANT_DOCS; do
    log_info "  - Processing: $doc"
    
    # Locate file (Obsidian or Docs)
    file_path=""
    if [ -f "$WORKSPACE_ROOT/docs/$doc" ]; then
      file_path="$WORKSPACE_ROOT/docs/$doc"
    elif [ -f "$WORKSPACE_ROOT/$doc" ]; then
      file_path="$WORKSPACE_ROOT/$doc"
    else
      # Recursive search in obsidian
      file_path=$(find "$WORKSPACE_ROOT/obsidian" -name "$doc" | head -n 1)
    fi
    
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
      {
        echo ""
        echo "## 📄 Context: $doc"
        echo "*(Source: $file_path)*"
        echo ""
        # Only take the first 50 lines to prevent context blowup (Pruning)
        head -n 50 "$file_path"
        echo ""
        echo "---"
      } >> "$HOT_CONTEXT_FILE"
    else
      log_warn "Could not locate: $doc"
    fi
  done
fi

log_info "✅ Intelligence Pruned! Hot Context ready at: $HOT_CONTEXT_FILE"
