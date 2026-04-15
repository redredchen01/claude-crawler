#!/bin/bash
# OpenClaw Meta-Orchestrator — 驅動框架自我進化
# 1. 數據採集 -> 2. 自我分析 -> 3. 模型重訓 -> 4. 儀表板更新

PROJECT_DIR="/Users/dex/YD 2026/projects/production/claude_code_telegram_bot"
cd "$PROJECT_DIR"

echo "🌀 [$(date)] Starting Self-Evolution Loop..."

# 1. 更新數據集 (包含失敗案例)
node dspy-data-prep.mjs

# 2. 自我分析與經驗沉澱
node self-analysis.mjs

# 3. 自動模型重訓
node auto-retrain.mjs

# 4. 更新今日 Context 與 Dashboard
node auto-daily-context.mjs

echo "✨ [$(date)] Evolution Loop Complete."
