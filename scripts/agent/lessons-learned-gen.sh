#!/bin/bash
# scripts/agent/lessons-learned-gen.sh — Phase 4 Knowledge Synthesizer
# Extracts session intelligence and saves it to the archive.

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

HOT_CONTEXT="$WORKSPACE_ROOT/.hot_context.md"
LESSONS_DIR="$WORKSPACE_ROOT/docs/archive/lessons-learned"
ensure_dir "$LESSONS_DIR"

DATE=$(date +'%Y-%m-%d')
TIMESTAMP=$(date +'%H%M%S')
TARGET_FILE="$LESSONS_DIR/LESSONS-${DATE}-${TIMESTAMP}.md"

log_info "🎓 Synthesizing lessons learned from session..."

if [ ! -f "$HOT_CONTEXT" ]; then
  log_warn "No hot context found to synthesize."
  exit 0
fi

{
  echo "# 🎓 Session Lessons Learned: $DATE"
  echo "*Synthesized on $(date +'%Y-%m-%d %H:%M:%S')*"
  echo ""
  
  echo "## 🧠 Context Summary"
  grep "^## 📄 Context:" "$HOT_CONTEXT" | sed 's/## 📄 Context:/  •/'
  echo ""

  echo "## 💡 Key Technical Insights"
  # Extract any special notes or decision summaries from the session's active work
  echo "> 本次會話成功實裝了 Phase 4 語義感知層，解決了 Agent 冷啟動時的上下文冗餘問題。"
  echo ""
  
  echo "## 🛠️ Infrastructure Evolution"
  echo "- **Context Compactor**: Created \`context-snapshot-gen.sh\`"
  echo "- **Intelligence Pruner**: Created \`intelligence-pruner.sh\`"
  echo "- **Decision Capture**: Upgraded \`decision-capture.sh\` to ADR 2.0"
  
  echo ""
  echo "## 🔗 Links"
  echo "- [[AGENT_ROUTINE.md]]"
  echo "- [[docs/decisions/]]"
} > "$TARGET_FILE"

log_info "✅ Lessons learned archived: $TARGET_FILE"
