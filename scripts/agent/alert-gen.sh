#!/bin/bash

# ============================================
# Alert Generator for Obsidian Dashboard
# Extracts critical errors from agent-check.sh
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/DASHBOARD.md"
CHECK_LOG="$SCRIPT_DIR/../../agent-check.log"

generate_alerts() {
  # Run check and save to log
  "$SCRIPT_DIR/agent-check.sh" > "$CHECK_LOG" 2>&1
  
  # Extract errors (lines starting with ❌)
  errors=$(grep "❌" "$CHECK_LOG")
  
  if [ -z "$errors" ]; then
    alert_text="✅ 當前工作空間健康度 100%，無斷裂鏈接或配置缺失。"
  else
    alert_text="> [!danger] 檢測到以下嚴重問題：\n"
    # Push Alerts to Telegram (Only if errors exist)
    "$SCRIPT_DIR/tg-notifier.sh" "🚨 <b>工作空間警示！</b>\n📅 專案: YD 2026\n🔍 檢測到斷裂鏈接或配置缺失，請查看 Obsidian 指揮中心。"
    
    while read -r line; do
      alert_text="$alert_text> $line\n"
    done <<< "$errors"
  fi

  # Replace the alert section in DASHBOARD.md
  # Use a simpler placeholder logic for now
  sed -i '' "/## 🚨 工作空間警示/,/---/c\\
## 🚨 工作空間警示 (Workspace Alerts)\\
> [!caution] 如果此處出現紅字，請立即運行 \`./scripts/agent/agent-check.sh\`。\\
\\
$alert_text\\
\\
---" "$DASHBOARD"

  echo "✅ Dashboard alerts updated."
}

generate_alerts
chmod +x "$SCRIPT_DIR/alert-gen.sh"
