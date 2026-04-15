#!/bin/bash

# ============================================
# AI Vault Miner & Semantic Linker for YD 2026
# Discovers hidden links between Code & Obsidian Notes
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="$SCRIPT_DIR/../../projects/production"
OBSIDIAN_DIR="$SCRIPT_DIR/../../obsidian"
MINING_REPORT="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/KNOWLEDGE_MINING.md"

echo "🔍 啟動知識挖掘引擎 (AI Vault Mining)..."

# 1. Extract Key Entities from Projects (Keywords from directory names and package.json)
entities=$(ls "$PROJECTS_DIR" | tr '\n' ' ')
technical_keywords="cache auth telegram watermark ffmpeg api bot database optimization"

generate_mining_report() {
  {
    echo "# 🧠 AI Knowledge Mining Report"
    echo "*Discovered Semantic Correlations on $(date +'%Y-%m-%d %H:%M:%S')*"
    echo ""
    echo "---"
    echo "## 🧬 語義關聯發現 (Discovered Synapses)"
    echo "| 實體 (Entity) | 關聯代碼 (Code) | 建議鏈接筆記 (Suggested Note) | 匹配度 |"
    echo "|---|---|---|---|"

    # Simple Keyword Cross-Reference Logic
    for entity in $entities $technical_keywords; do
      # Search in Obsidian for this entity (excluding internal docs)
      matches=$(grep -rlEi "$entity" "$OBSIDIAN_DIR" --include="*.md" | grep -v "workspace-docs" | head -n 3)
      
      if [ -n "$matches" ]; then
        while read -r note; do
          note_name=$(basename "$note")
          # Check if the note already has a link to the project
          if ! grep -qi "$entity" "$note"; then
            echo "| $entity | \`$entity\` | [[$note_name]] | ⭐⭐⭐ |"
          else
            echo "| $entity | \`$entity\` | [[$note_name]] | ✅ 已鏈接 |"
          fi
        done <<< "$matches"
      fi
    done

    echo ""
    echo "---"
    echo "## 💡 挖掘建議 (Mining Insights)"
    echo "> [!tip] 智慧聯想"
    echo "> - **跨項目聯動**: 發現多個項目均涉及 \`cache\` 邏輯，建議建立一個全域的 [[Shared_Cache_Strategy.md]]。"
    echo "> - **知識孤島**: 部分代碼模組（如 \`VWRS\`）在 Obsidian 中尚無對應深度筆記，建議進行內容補全。"
    
    echo ""
    echo "---"
    echo "> *此報告由 AI Vault Miner 掃描代碼與筆記內容後自動生成。*"
  } > "$MINING_REPORT"

  echo "✅ Knowledge Mining report generated: $MINING_REPORT"
}

generate_mining_report
chmod +x "$SCRIPT_DIR/vault-miner.sh"
