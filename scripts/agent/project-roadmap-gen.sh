#!/bin/bash

# ============================================
# Project Roadmap Generator (Gantt) for YD 2026
# Generates a temporal view of task progression
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
ROADMAP_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/PROJECT_ROADMAP.md"

echo "📅 正在生成動態專案路線圖 (Gantt Roadmap)..."

generate_roadmap() {
  {
    echo "# 🗺️ Project Dynamic Roadmap"
    echo "*Last Synchronized: $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## 🕒 開發時間軸 (Development Timeline)"
    echo "\`\`\`mermaid"
    echo "gantt"
    echo "    title YD 2026 Project Evolution"
    echo "    dateFormat  YYYY-MM-DD"
    echo "    axisFormat  %m-%d"
    echo "    section 核心任務 (Core Tasks)"
    
    # Process tasks to generate Gantt lines
    # We use created_at as start date, and approximate duration based on status
    jq -r '
      .tasks | to_entries | .[] | 
      .key as $id | 
      .value.status as $status |
      (.value.created_at | split("T")[0]) as $start |
      (if $status == "done" then "done" elif $status == "pending" then "active" else "" end) as $tag |
      "    \($id) : \($tag), \($start), 3d"' "$TASKS_FILE" >> "$ROADMAP_FILE"

    echo "\`\`\`"
    echo ""
    echo "---"
    echo "## 💡 路線圖說明"
    echo "> [!info] 提示"
    echo "> - **紫色 (done)**: 已完成任務。"
    echo "> - **藍色 (active)**: 正在進行或待辦任務。"
    echo "> - 此圖表根據任務創建日期與狀態動態生成。"
  } > "$ROADMAP_FILE"

  echo "✅ Project Roadmap generated: $ROADMAP_FILE"
}

generate_roadmap
chmod +x "$SCRIPT_DIR/project-roadmap-gen.sh"
