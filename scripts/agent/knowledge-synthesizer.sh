#!/bin/bash

# ============================================
# Knowledge Synthesizer for YD 2026
# Aggregates ADRs, READMEs, and Tags into Master Knowledge Base
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_KB="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/MASTER_KNOWLEDGE_BASE.md"
DECISION_DIR="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/decisions"

echo "🧠 正在執行全域知識合成 (Synthesizing Master Knowledge Base)..."

generate_master_kb() {
  {
    echo "# 🏛️ Master Knowledge Base: YD 2026"
    echo "*Synthesized on $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## ⚖️ 核心技術決策 (Consolidated Decisions)"
    echo "> [!abstract] 最近期的架構決定與技術標準。"
    echo ""
    
    ls -t "$DECISION_DIR"/*.md 2>/dev/null | head -n 10 | while read -r f; do
      title=$(head -n 1 "$f" | sed 's/# //')
      echo "- [[$(basename "$f")| $title]]" >> "$MASTER_KB"
    done
    
    echo ""
    echo "## 🛡️ 已建立的標準與模式 (Standards & Patterns)"
    echo "> [!note] 通過代碼掃描發現的模式。"
    echo "- **自動化治理**: 基於 \`scripts/agent/\` 的閉環維護模式。"
    echo "- **文檔映射**: \`@docs\` 標籤驅動的語義鏈接規範。"
    echo "- **通訊通知**: 跨項目共享的 \`tg-notifier.sh\` 通訊機制。"
    
    echo ""
    echo "---"
    echo "> *此文檔由 AI Synthesizer 定期更新。*"
  } > "$MASTER_KB"

  echo "✅ Master Knowledge Base synthesized: $MASTER_KB"
}

generate_master_kb
chmod +x "$SCRIPT_DIR/knowledge-synthesizer.sh"
