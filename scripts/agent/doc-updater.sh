#!/bin/bash

# ============================================
# Smart Doc Updater & Classifier for YD 2026
# Syncs docs/ into obsidian/projects/workspace-docs/
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_DIR="$SCRIPT_DIR/../../docs"
INDEX_FILE="$DOC_DIR/INDEX.md"
VAULT_DOC_DIR="$SCRIPT_DIR/../../obsidian/projects/workspace-docs"

# Helper for Smart Linking
smart_link() {
  local src="$1"
  local subfolder="$2"
  local base=$(basename "$src")
  local target="$VAULT_DOC_DIR/$subfolder/$base"

  # If not exists or different, create symlink
  if [ ! -L "$target" ] || [ "$(readlink "$target")" != "../../../../docs/$base" ]; then
    ln -sf "../../../../docs/$base" "$target"
    echo "🔗 Linked $base -> $subfolder/"
  fi
}

update_index_and_sync() {
  echo "# Workspace Documentation Index" > "$INDEX_FILE"
  echo "" >> "$INDEX_FILE"

  # --- 1. Architecture & Core ---
  echo "## 🏗️ Architecture & Core Structure" >> "$INDEX_FILE"
  ls "$DOC_DIR"/*.md | grep -E "ARCHITECTURE|WORKSPACE|CI-CD|CHANGELOG" | while read -r f; do
    base=$(basename "$f")
    echo "- [$base]($base)" >> "$INDEX_FILE"
    smart_link "$f" "architecture"
  done
  echo "" >> "$INDEX_FILE"

  # --- 2. Plans ---
  echo "## 🚀 Optimization & Plans" >> "$INDEX_FILE"
  ls "$DOC_DIR"/*.md | grep -E "PLAN|ROADMAP" | while read -r f; do
    base=$(basename "$f")
    echo "- [$base]($base)" >> "$INDEX_FILE"
    smart_link "$f" "plans"
  done
  echo "" >> "$INDEX_FILE"

  # --- 3. Scaffolds & Templates ---
  echo "## 🛠️ Scaffolds & Templates" >> "$INDEX_FILE"
  ls "$DOC_DIR"/*.md | grep -E '\$\{NAME\}|hello-world|文檔名稱' | while read -r f; do
    base=$(basename "$f")
    echo "- [$base]($base)" >> "$INDEX_FILE"
    # No smart_link needed for templates in obsidian, but let's keep it clean
  done
  echo "" >> "$INDEX_FILE"

  # --- 4. Execution Reports (Recent) ---
  echo "## 🗓️ Execution Reports & Logs" >> "$INDEX_FILE"
  ls -t "$DOC_DIR"/*.md | grep -E "[0-9]{4}_[0-9]{2}_[0-9]{2}|REPORT" | while read -r f; do
    base=$(basename "$f")
    echo "- [$base]($base)" >> "$INDEX_FILE"
    smart_link "$f" "reports"
  done
  echo "" >> "$INDEX_FILE"

  echo "---" >> "$INDEX_FILE"
  echo "*Auto-updated and Classified by doc-updater.sh on $(date +'%Y-%m-%d %H:%M:%S')*" >> "$INDEX_FILE"
  
  # Trigger Clausidian Sync if possible
  if command -v clausidian >/dev/null 2>&1; then
    echo "🔄 觸發 Clausidian 索引更新..."
    clausidian sync >/dev/null 2>&1 || true
  fi

  echo "✅ Updated $INDEX_FILE and synchronized with Obsidian Vault."
}

update_index_and_sync
