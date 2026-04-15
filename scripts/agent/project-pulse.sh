#!/bin/bash

# ============================================
# Project Pulse (Metrics Generator) for YD 2026
# Calculates Progress, Doc Coverage, and Health Score
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
PROJECTS_DIR="$SCRIPT_DIR/../../projects/production"
PULSE_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/PROJECT_PULSE.md"

echo "📊 正在計算專案脈搏 (Project Pulse Metrics)..."

calculate_metrics() {
  # 1. Task Completion Rate
  local total_tasks=$(jq '.tasks | length' "$TASKS_FILE")
  local done_tasks=$(jq '.tasks | to_entries | map(select(.value.status == "done")) | length' "$TASKS_FILE")
  local task_percent=0
  [ "$total_tasks" -gt 0 ] && task_percent=$(( done_tasks * 100 / total_tasks ))

  # 2. Documentation Coverage
  local total_code_files=$(find "$PROJECTS_DIR" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" -o -name "*.mjs" \) | wc -l | tr -d ' ')
  local documented_files=$(grep -r "@docs \[" "$PROJECTS_DIR" --include="*.sh" --include="*.js" --include="*.py" --include="*.mjs" | cut -d':' -f1 | sort -u | wc -l | tr -d ' ')
  local doc_percent=0
  [ "$total_code_files" -gt 0 ] && doc_percent=$(( documented_files * 100 / total_code_files ))

  # 3. System Health Score (Start at 100, -10 per Error)
  local health_score=100
  local error_count=$(grep -c "❌" "$SCRIPT_DIR/../../agent-check.log" || echo 0)
  health_score=$(( 100 - (error_count * 10) ))
  [ "$health_score" -lt 0 ] && health_score=0

  # Generate Markdown with Mermaid Pie Charts
  {
    echo "# 📈 Project Pulse Metrics"
    echo "*Updated: $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## 🎯 關鍵指標 (Key Metrics)"
    echo "| 指標 | 數值 | 狀態 |"
    echo "|---|---|---|"
    echo "| **任務完成率** | $task_percent% | $( [ $task_percent -lt 50 ] && echo "🟠 In Progress" || echo "🟢 On Track" ) |"
    echo "| **文檔覆蓋率** | $doc_percent% | $( [ $doc_percent -lt 30 ] && echo "🔴 Low" || echo "🟢 Healthy" ) |"
    echo "| **系統健康分** | $health_score/100 | $( [ $health_score -lt 80 ] && echo "⚠️ Alert" || echo "🛡️ Stable" ) |"
    echo ""
    echo "---"
    echo "## 📊 視覺化進度 (Visual Progress)"
    echo "\`\`\`mermaid"
    echo "pie title 任務完成比例"
    echo "    \"Done\" : $done_tasks"
    echo "    \"Pending\" : $(( total_tasks - done_tasks ))"
    echo "\`\`\`"
    echo ""
    echo "\`\`\`mermaid"
    echo "pie title 代碼文檔覆蓋率"
    echo "    \"Documented\" : $documented_files"
    echo "    \"Undocumented\" : $(( total_code_files - documented_files ))"
    echo "\`\`\`"
  } > "$PULSE_FILE"

  echo "✅ Project Pulse generated: $PULSE_FILE"
}

calculate_metrics
chmod +x "$SCRIPT_DIR/project-pulse.sh"
