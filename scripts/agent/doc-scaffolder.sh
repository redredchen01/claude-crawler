#!/bin/bash

# ============================================
# Self-Healing Doc Scaffolder for YD 2026
# Generates a draft .md from source code file
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$DOC_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: doc-scaffolder.sh <doc_name.md> <source_file_path>"
  exit 1
fi

TARGET_PATH="$SCRIPT_DIR/../../docs/$DOC_NAME"

# Check if doc already exists
if [ -f "$TARGET_PATH" ]; then
  echo "⚠️ 文檔 $DOC_NAME 已存在，取消生成。"
  exit 0
fi

echo "🧬 正在從 $SOURCE_FILE 提取邏輯並生成 $DOC_NAME..."

# Generate Content
{
  echo "# Documentation: $DOC_NAME"
  echo "*Auto-generated scaffold based on $SOURCE_FILE on $(date +'%Y-%m-%d')*"
  echo ""
  echo "## 🏷️ Overview"
  echo "此文件是針對 \`$SOURCE_FILE\` 的自動生成文檔草案。"
  echo ""
  echo "## 🏗️ Code Entities (代碼組件)"
  echo "以下是從源文件中自動掃描到的實體："
  echo ""
  
  # Scan for functions, classes or variables (Generic regex)
  grep -E "function |class |export |def " "$SOURCE_FILE" | sed 's/^[ \t]*//' | while read -r line; do
    echo "- [ ] \`$line\`"
  done
  
  echo ""
  echo "## 💡 Usage & Implementation"
  echo "> [!note] 請在此補充該組件的詳細使用說明與設計初衷。"
  echo ""
  echo "## 🔗 References"
  echo "- Source: \`$SOURCE_FILE\`"
  echo ""
  echo "---"
  echo "tags: [workspace/doc-scaffold, source/auto-gen]"
} > "$TARGET_PATH"

# Trigger a sync so it appears in INDEX and Obsidian
"$SCRIPT_DIR/doc-updater.sh"

echo "✅ 文檔草案已生成並掛載至 $TARGET_PATH"
chmod +x "$SCRIPT_DIR/doc-scaffolder.sh"
