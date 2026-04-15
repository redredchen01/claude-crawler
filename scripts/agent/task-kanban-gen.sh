#!/bin/bash

# ============================================
# Task Kanban Generator for Obsidian (YD 2026)
# Converts tasks.json -> TASK_KANBAN.md
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Path to tasks.json (Retrieved from previous investigation)
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
KANBAN_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/TASK_KANBAN.md"

if [ ! -f "$TASKS_FILE" ]; then
  echo "⚠️ tasks.json 不存在，跳過看板生成。"
  exit 0
fi

generate_kanban() {
  echo "# 📋 Project Task Kanban" > "$KANBAN_FILE"
  echo "*Last Sync: $(date +'%Y-%m-%d %H:%M:%S')*" >> "$KANBAN_FILE"
  echo "" >> "$KANBAN_FILE"
  echo "---" >> "$KANBAN_FILE"

  # --- Pending Column ---
  echo "## 📥 Pending (待辦)" >> "$KANBAN_FILE"
  jq -r '.tasks | to_entries[] | select(.value.status == "pending") | "- [ ] **\(.key)**: \(.value.description) <!-- \(.value.created_at) -->"' "$TASKS_FILE" >> "$KANBAN_FILE"
  echo "" >> "$KANBAN_FILE"

  # --- In Progress Column ---
  echo "## ⚡ In Progress (進行中)" >> "$KANBAN_FILE"
  # Note: agent-tasks.sh handles 'pending' and 'done', we'll treat 'assigned' as In Progress
  jq -r '.tasks | to_entries[] | select(.value.status == "pending" and .value.assigned_to != null) | "- [/] **\(.key)**: \(.value.description) 👤 @\(.value.assigned_to)"' "$TASKS_FILE" >> "$KANBAN_FILE"
  echo "" >> "$KANBAN_FILE"

  # --- Done Column ---
  echo "## ✅ Done (已完成)" >> "$KANBAN_FILE"
  jq -r '.tasks | to_entries[] | select(.value.status == "done") | "- [x] ~~\(.key)~~: \(.value.description)"' "$TASKS_FILE" >> "$KANBAN_FILE"
  echo "" >> "$KANBAN_FILE"

  echo "---" >> "$KANBAN_FILE"
  echo "> [!tip] 操作指令\n> 使用 \`agent-tasks done <id>\` 標記完成，看板將自動更新。" >> "$KANBAN_FILE"
  
  echo "✅ Kanban generated: $KANBAN_FILE"
}

generate_kanban
chmod +x "$SCRIPT_DIR/task-kanban-gen.sh"
