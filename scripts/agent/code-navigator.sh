#!/bin/bash

# ============================================
# Semantic Code Navigator for YD 2026
# Finds code implementations across all projects based on entities
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_ROOT="$SCRIPT_DIR/../../projects/production"
NAV_REPORT="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/CODE_NAVIGATOR.md"

QUERY="$1"

if [ -z "$QUERY" ]; then
  echo "Usage: code-navigator.sh <keyword>"
  exit 0
fi

echo "🔍 正在全域搜尋代碼實現: $QUERY"

echo "# 🧭 Code Navigator: $QUERY" > "$NAV_REPORT"
echo "*Search Results for '$QUERY' on $(date +'%Y-%m-%d %H:%M:%S')*" >> "$NAV_REPORT"
echo ""
echo "| 項目 (Project) | 代碼實例 (Code Context) | 文件路徑 (File Path) |" >> "$NAV_REPORT"
echo "|---|---|---|" >> "$NAV_REPORT"

# Search for the query in source files across all projects
grep -rEi "$QUERY" "$PROJECTS_ROOT" --include="*.sh" --include="*.js" --include="*.py" --include="*.mjs" --include="*.md" | head -n 20 | while read -r line; do
  file_path=$(echo "$line" | cut -d':' -f1)
  # Relative path from projects root
  rel_path=${file_path#$PROJECTS_ROOT/}
  project_name=$(echo "$rel_path" | cut -d'/' -f1)
  content=$(echo "$line" | cut -d':' -f2- | sed 's/^[ \t]*//' | cut -c 1-50)
  
  echo "| **$project_name** | \`$content...\` | \`$rel_path\` |" >> "$NAV_REPORT"
done

echo ""
echo "---" >> "$NAV_REPORT"
echo "> [!tip] 提示\n> 此導航報告為全域實時搜索結果。輸入 \`code-navigator.sh <key>\` 以刷新。" >> "$NAV_REPORT"

echo "✅ Code Navigation report updated: $NAV_REPORT"
chmod +x "$SCRIPT_DIR/code-navigator.sh"
