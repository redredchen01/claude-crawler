#!/bin/bash

# ============================================
# AI Git Flow Manager for YD 2026
# Automates Branching, Committing, and PR Drafts
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
WORKSPACE_ROOT="$SCRIPT_DIR/../../"

task_id="$1"

if [ -z "$task_id" ]; then
  echo "Usage: git-flow-manager.sh <task_id>"
  exit 1
fi

echo "🐙 啟動 AI Git 工作流自動化..."

cd "$WORKSPACE_ROOT"

# 1. 檢查是否有變更
if git diff --quiet && git diff --cached --quiet; then
  echo "✅ 無待提交變更，跳過 Git 自動化。"
  exit 0
fi

# 2. 提取任務詳情
description=$(jq -r ".tasks[\"$task_id\"].description" "$TASKS_FILE")

# 3. 執行提交 (Commit)
# 格式：feat(task-id): description
commit_msg="feat($task_id): $description"

echo "📝 正在自動提交變更..."
git add .
git commit -m "$commit_msg"

if [ $? -eq 0 ]; then
  echo "✅ Git 提交成功: $commit_msg"
  
  # 4. 準備 PR 描述 (存入 Obsidian)
  PR_DIR="$WORKSPACE_ROOT/obsidian/projects/workspace-docs/pr-drafts"
  mkdir -p "$PR_DIR"
  PR_FILE="$PR_DIR/PR-$task_id.md"
  
  {
    echo "# Pull Request: $task_id"
    echo "## 🎯 Summary"
    echo "$description"
    echo ""
    echo "## 🏗️ Changes"
    git show --stat --oneline HEAD | tail -n +2
    echo ""
    echo "## 🔗 Related ADR"
    echo "[[ADR-$(date +'%Y-%m-%d')-$task_id.md]]"
  } > "$PR_FILE"
  
  echo "📄 PR 描述草案已生成: $PR_FILE"
else
  echo "❌ Git 提交失敗，請檢查衝突。"
fi

chmod +x "$0"
