#!/bin/bash

# ============================================
# Dynamic Shell Loader for YD 2026
# Project-aware context and aliases
# ============================================

# This function should be added to your shell hook (e.g., chpwd in zsh)
workspace_context_update() {
  local current_dir=$(pwd)
  
  # Clear old dynamic aliases if any
  unalias p-test p-start p-build 2>/dev/null

  # Project: GWX
  if [[ "$current_dir" == *"projects/production/gwx"* ]]; then
    alias p-test="npm test"
    alias p-start="npm start"
    echo "💡 [Context] 已進入 GWX 項目，加載 p-test, p-start 別名。"
  
  # Project: TG Bot
  elif [[ "$current_dir" == *"projects/production/claude_code_telegram_bot"* ]]; then
    alias p-test="node smoke-test.mjs"
    alias p-start="node tg-bot.mjs"
    echo "💡 [Context] 已進入 TG Bot 項目，加載 p-test, p-start 別名。"

  # Project: VWRS
  elif [[ "$current_dir" == *"projects/production/video-watermark-removal-system"* ]]; then
    alias p-test="node tests/smoke.js"
    alias p-start="node src/main.js"
    echo "💡 [Context] 已進入 VWRS 項目，加載 p-test, p-start 別名。"
  fi
}

# Auto-execute on source
workspace_context_update
