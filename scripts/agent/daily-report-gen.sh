#!/bin/bash

# ============================================
# Daily Report Skill v1.0.1 — Integrated Intelligence Summary
# Aggregates metrics, tasks, and service health into a 5-block summary.
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

FEED_FILE="$WORKSPACE_ROOT/obsidian/projects/workspace-docs/ACTIVITY_FEED.md"
REPORT_FILE="$WORKSPACE_ROOT/obsidian/projects/workspace-docs/DAILY_REPORT.md"
ALERT_LOG="/tmp/service_alerts.log"
LESSONS_DIR="$WORKSPACE_ROOT/docs/archive/lessons-learned"

log_info "📝 Generating Daily Intelligence Report (5-Block Format)..."

# 1. Collect Today's Achievements (from Activity Feed / Git)
get_achievements() {
  echo "### 📂 今日核心成就 (Key Achievements)"
  # Try to grab the last 5 Git commits marked with ✅
  grep "✅" "$FEED_FILE" | head -n 5 | sed 's/^  - //' || echo "  • 進行了日常維護與優化。"
  echo ""
}

# 2. Collect Progress Update (from Task Manager)
get_progress() {
  echo "### 🚀 進度更新 (Progress Update)"
  if [ -f "$SCRIPT_DIR/agent-tasks.sh" ]; then
    bash "$SCRIPT_DIR/agent-tasks.sh" status 2>/dev/null | grep "✓" | tail -n 3 | sed 's/  ✓ /- /' || echo "  - 專案穩步推進中。"
  else
    echo "  - 任務管理器離線。"
  fi
  echo ""
}

# 3. Collect Problems & Blockers (from Service Watchdog)
get_blockers() {
  echo "### 🚨 問題與阻礙 (Issues & Blockers)"
  if [ -f "$ALERT_LOG" ]; then
    grep "DOMAIN_ALERT" "$ALERT_LOG" | while IFS='|' read type domain days expiry; do
      echo "  - **域名風險**: $domain 將在 $days 天後過期 ($expiry)！"
    done
  fi
  
  # Check if Dashboard is down (Exit Code 7 from session-wrap was observed)
  if ! curl -s --head --request GET "http://localhost:3001" --max-time 2 > /dev/null; then
    echo "  - **服務故障**: Dashboard Backend (:3001) 目前無法連線。"
  fi
  
  if [ ! -s "$ALERT_LOG" ] && curl -s --head --request GET "http://localhost:3001" --max-time 2 > /dev/null; then
    echo "  - 目前無重大阻塞問題。"
  fi
  echo ""
}

# 4. Collect AI Highlights (from Lessons Learned)
get_highlights() {
  echo "### 💡 AI 亮點与反思 (Intelligence & Lessons)"
  LATEST_LESSONS=$(ls -t "$LESSONS_DIR"/LESSONS-*.md 2>/dev/null | head -n 1 || echo "")
  if [ -n "$LATEST_LESSONS" ]; then
    echo "  - **最新心得**: [[$(basename "$LATEST_LESSONS")]]"
    # Extract one bullet point from technical insights if possible
    grep "^- " "$LATEST_LESSONS" | head -n 1 | sed 's/^- /  - /' || true
  else
    echo "  - 保持工作流一致性，提升 Agent 自主決策質量。"
  fi
  echo ""
}

# 5. Collect Tomorrow's Focus (from Task Manager)
get_tomorrow() {
  echo "### 📅 明日行動建議 (Tomorrow's Focus)"
  if [ -f "$SCRIPT_DIR/agent-tasks.sh" ]; then
    NEXT_TASKS=$(bash "$SCRIPT_DIR/agent-tasks.sh" next 2>/dev/null | grep "□" | head -n 2 | sed 's/   □ /1. /' || echo "")
    if [ -n "$NEXT_TASKS" ]; then
      echo "$NEXT_TASKS"
    else
      echo "1. 進行架構審查或代碼重構。"
      echo "2. 執行 \`agent-check.sh\` 確保系統健康。"
    fi
  else
    echo "1. 繼續推進當前任務。"
  fi
  echo ""
}


# Generate final report
DATE=$(date +'%Y-%m-%d')
{
  echo "# 📋 Daily Intelligence Report: $DATE"
  echo "*Auto-synthesized by YD 2026 Daily Report Skill*"
  echo ""
  echo "---"
  get_achievements
  get_progress
  get_blockers
  get_highlights
  get_tomorrow
  echo "---"
  echo "> [!info] 這是由 AI 系統自動彙整的日報。更多細節請查閱 [[ACTIVITY_FEED.md]]。"
} > "$REPORT_FILE"

log_info "✅ Daily Report generated at $REPORT_FILE"
chmod +x "$SCRIPT_DIR/daily-report-gen.sh"
