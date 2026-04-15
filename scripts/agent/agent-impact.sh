#!/bin/bash

# ============================================
# Impact Analysis Engine for YD 2026
# Analyzes the ripple effect of a component change
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_GRAPH="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/PROJECT_GRAPH.md"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"

QUERY="$1"

if [ -z "$QUERY" ]; then
  echo "Usage: agent-impact.sh <component_name>"
  echo "Example: agent-impact.sh ffmpeg-handler.js"
  exit 0
fi

echo "🔍 正在分析 '$QUERY' 的全域影響力..."
echo "──────────────────────────────────"

# 1. 檢查關聯文檔 (From Graph)
echo "📚 關聯文檔 (Associated Docs):"
grep "$QUERY" "$PROJECT_GRAPH" | grep "-->" | cut -d'>' -f2 | tr -d ' ' | while read -r doc; do
  echo "   - [[$doc]]"
done || echo "   (無直接文檔關聯)"

# 2. 檢查任務依賴 (From Tasks)
echo "📋 受影響任務 (Dependent Tasks):"
# Find tasks where this query is mentioned in description
jq -r --arg q "$QUERY" '.tasks | to_entries | .[] | select(.value.description | contains($q)) | "   - \(.key): \(.value.description)"' "$TASKS_FILE" || echo "   (無直接任務關聯)"

# 3. 檢查代碼引用 (From grep)
echo "💻 代碼依賴 (Code References):"
grep -r "$QUERY" "$SCRIPT_DIR/../../projects/production" --include="*.js" --include="*.sh" --include="*.py" | grep -v "$QUERY:" | head -n 5 | while read -r line; do
  echo "   - $(basename $(echo "$line" | cut -d':' -f1))"
done

echo "──────────────────────────────────"
echo "💡 建議：改動此組件後，請優先更新上述文檔並重新執行受影響任務的測試。"
chmod +x "$0"
