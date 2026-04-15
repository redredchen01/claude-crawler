#!/bin/bash

# ============================================
# Strategy Advisory Generator for YD 2026
# Proactive suggestions based on metrics
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PULSE_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/PROJECT_PULSE.md"
ADVISORY_FILE="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/STRATEGY_ADVISORY.md"

echo "🧠 正在生成 AI 策略建議 (Strategy Advisory)..."

generate_advisory() {
  # Extract numeric values from Pulse
  local task_percent=$(grep "任務完成率" "$PULSE_FILE" | sed 's/.*| \([0-9]*\)%.*/\1/')
  local doc_percent=$(grep "文檔覆蓋率" "$PULSE_FILE" | sed 's/.*| \([0-9]*\)%.*/\1/')
  local health_score=$(grep "系統健康分" "$PULSE_FILE" | sed 's/.*| \([0-9]*\)\/100.*/\1/')

  {
    echo "# 🧠 Strategy Advisory"
    echo "*Last Insight: $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## 🔍 AI 主動觀察 (Observation)"
    
    if [ "$doc_percent" -lt 50 ]; then
      echo "> [!warning] 文檔覆蓋率偏低 ($doc_percent%)"
      echo "> **建議**：目前代碼與文檔的鏈接不足，建議在下一個任務中，為 \`projects/production/\` 下的核心模組補充 \`@docs\` 標籤。"
    fi

    if [ "$health_score" -lt 90 ]; then
      echo "> [!danger] 系統健康分警示 ($health_score/100)"
      echo "> **建議**：存在斷裂的語義鏈接或配置缺失。請優先執行 \`./scripts/agent/agent-check.sh\` 並修復告警。"
    fi

    if [ "$task_percent" -gt 80 ]; then
      echo "> [!success] 項目進展順利 ($task_percent%)"
      echo "> **建議**：核心功能已接近完成，可以開始規劃下一個 Milestone 或進行代碼重構。"
    fi

    echo ""
    echo "## 🚀 當前最佳路徑 (Strategic Path)"
    echo "1. **修復**：解決 \`DASHBOARD.md\` 中的紅色告警。"
    echo "2. **同步**：運行 \`doc-updater.sh\` 確保 Obsidian 索引最新。"
    echo "3. **決策**：針對最近完成的任務，查看 ADR 並進行總結。"
    
    echo ""
    echo "---"
    echo "> *此建議由 AI 指標分析引擎自動生成。*"
  } > "$ADVISORY_FILE"

  echo "✅ Strategy Advisory generated: $ADVISORY_FILE"
}

generate_advisory
chmod +x "$SCRIPT_DIR/strategy-advisory.sh"
