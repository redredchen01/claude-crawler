#!/bin/bash

# ============================================
# Workspace-to-Telegram Notifier Bridge
# Sends critical workspace updates to TG Bot
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TG_BOT_DIR="$SCRIPT_DIR/../../projects/production/claude_code_telegram_bot"
MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
  echo "Usage: tg-notifier.sh <message>"
  exit 1
fi

echo "📤 正在通過 TG Bot 發送通知..."

# Use node to call the notification module
# Assuming notify-telegram.mjs can take direct text
cd "$TG_BOT_DIR"
node -e "import('./notify-telegram.mjs').then(m => m.sendTelegram('${MESSAGE}'))" 2>/dev/null || \
node -e "import('./tg-utils.mjs').then(m => m.sendTelegram('${MESSAGE}'))"

if [ $? -eq 0 ]; then
  echo "✅ 通知已發送至 Telegram。"
else
  echo "❌ TG 通知發送失敗，請檢查 Bot 配置。"
fi
