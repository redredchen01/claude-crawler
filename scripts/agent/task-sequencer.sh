#!/bin/bash

# ============================================
# AI Task Sequencer for YD 2026
# Calculates Impact Score & Predicts Bottlenecks
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASKS_FILE="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory/tasks/tasks.json"
STRATEGY_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/EXECUTION_STRATEGY.md"

echo "🧠 正在分析任務拓撲與關鍵路徑 (Analyzing Critical Path)..."

analyze_priority() {
  {
    echo "# 🎯 AI Execution Strategy: Next Actions"
    echo "*Strategic Priority calculated on $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## 🔥 高影響力任務 (High-Impact Actions)"
    echo "> [!abstract] 完成以下任務將解鎖最多的後續開發路徑。"
    echo ""
    echo "| 任務 ID | 影響力 (解鎖數) | 描述 |"
    echo "|---|---|---|"

    # Use jq to calculate how many times each pending task is a dependency for others
    jq -r '
      .tasks as $all |
      .tasks | to_entries | map(select(.value.status == "pending")) | .[] | .key as $target |
      {
        id: $target,
        desc: .value.description,
        impact: ([$all[] | select(.depends_on | contains([$target]))] | length)
      } | select(.impact > 0) | "| **\(.id)** | \(.impact) | \(.desc) |"' "$TASKS_FILE" | sort -t'|' -k3 -nr >> "$STRATEGY_FILE"

    echo ""
    echo "## 🚧 瓶頸預警 (Bottleneck Prediction)"
    # Find tasks that have many dependencies but are not yet completed
    local blockers=$(jq -r '.tasks | to_entries | map(select(.value.status == "pending" and (.value.depends_on | length) > 2)) | .[] | "- **\(.key)** (依賴於 \(.value.depends_on | length) 個任務)"' "$TASKS_FILE")
    
    if [ -z "$blockers" ]; then
      echo "✅ 目前無明顯的開發瓶頸。"
    else
      echo "> [!danger] 警告：以下任務因依賴過多，可能成為潛在瓶頸："
      echo "$blockers"
    fi

    echo ""
    echo "## ⚡ 建議執行順序 (Recommended Sequence)"
    jq -r '
      .tasks as $all |
      .tasks | to_entries | 
      map(select(.value.status == "pending")) | 
      map(select(.key as $k | [$all[] | select(.depends_on | contains([$k]))] | length > 0)) |
      limit(3; .[]) | "- [ ] **\(.key)**: \(.value.description)"' "$TASKS_FILE" >> "$STRATEGY_FILE"

    echo ""
    echo "---"
    echo "> *此策略由 AI 任務拓撲引擎自動生成。*"
  } > "$STRATEGY_FILE"

  echo "✅ Execution Strategy generated: $STRATEGY_FILE"
}

analyze_priority
chmod +x "$SCRIPT_DIR/task-sequencer.sh"
