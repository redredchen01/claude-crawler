#!/bin/bash

# ============================================
# Workspace Health Guard for YD 2026
# Checks for docs, tasks, and environment integrity
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_DIR="$SCRIPT_DIR/../../docs"
INDEX_FILE="$DOC_DIR/INDEX.md"
ENV_EXAMPLE="$SCRIPT_DIR/../../.env.example"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"

echo "🛡️ 啟動工作空間健康自檢..."
echo "──────────────────────────────────"

# 1. 檢查文檔索引完整性
missing_docs=$(ls "$DOC_DIR"/*.md | grep -v "INDEX.md" | while read -r f; do
  base=$(basename "$f")
  if ! grep -q "$base" "$INDEX_FILE"; then echo "$base"; fi
done)

if [ -n "$missing_docs" ]; then
  echo "⚠️ 發現未被 INDEX.md 索引的文檔:"
  echo "$missing_docs"
else
  echo "✅ 文檔索引完整"
fi

# 2. 檢查過期任務 (Stale Tasks)
# 超過 7 天未更新的 Pending 任務
if [ -f "$TASKS_FILE" ]; then
  stale_tasks=$(jq -r '.tasks | to_entries[] | select(.value.status == "pending") | .key' "$TASKS_FILE")
  if [ -n "$stale_tasks" ]; then
    echo "📅 提醒: 目前有待辦任務，建議及時處理或標記完成。"
  fi
fi

# 3. 檢查環境變量模板同步
if [ ! -f "$SCRIPT_DIR/../../.env" ]; then
  echo "❌ 警告: 缺少 .env 文件，請參考 .env.example 進行配置。"
fi

# 4. 檢查符號連結 (Broken Symlinks)
broken_links=$(find obsidian/projects/workspace-docs/ -type l ! -exec test -e {} \; -print)
if [ -n "$broken_links" ]; then
  echo "🔗 發現失效的符號連結:"
  echo "$broken_links"
else
  echo "✅ 連結完整性正常"
fi

# 5. 檢查語義鏈接完整性 (Semantic Link Integrity)
echo "🧬 正在檢查代碼語義鏈接 (@docs)..."
grep -r "@docs \[" "$SCRIPT_DIR/../../projects/production" --include="*.sh" --include="*.js" --include="*.py" --include="*.mjs" --include="*.md" 2>/dev/null | while read -r line; do
  file_path=$(echo "$line" | cut -d':' -f1)
  doc_name=$(echo "$line" | sed 's/.*@docs \[\(.*\)\].*/\1/')
  
  # Check if the doc exists in docs/ or obsidian/
  if [ ! -f "$SCRIPT_DIR/../../docs/$doc_name" ] && [ ! -f "$SCRIPT_DIR/../../obsidian/projects/workspace-docs/$doc_name" ]; then
    echo "❌ 斷裂的語義鏈接: 在 $(basename "$file_path") 中引用了不存在的 [[$doc_name]]"
    echo "   🛠️ 修復指令: ./scripts/agent/doc-scaffolder.sh \"$doc_name\" \"$file_path\""
  fi
done

# 6. 外部服務監控 (Service & Domain Watchdog)
if [ -f "$SCRIPT_DIR/service-watchdog.sh" ]; then
  bash "$SCRIPT_DIR/service-watchdog.sh"
fi

echo "──────────────────────────────────"
echo "✨ 健康自檢完成。"
chmod +x "$SCRIPT_DIR/agent-check.sh"
