#!/bin/bash

# ============================================
# Workspace Watcher for YD 2026
# Background listener for auto-integration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_DIR="$SCRIPT_DIR/../../docs"
OBSIDIAN_DIR="$SCRIPT_DIR/../../obsidian"
LOG_FILE="$SCRIPT_DIR/../../workspace-watcher.log"

# Load Core Library
if [ -f "$SCRIPT_DIR/../lib/core.sh" ]; then
  source "$SCRIPT_DIR/../lib/core.sh"
fi

trigger_update() {
  trigger_update() {
    # Log Rotation: If log > 1000 lines, reset
    if [ -f "$LOG_FILE" ] && [ $(wc -l < "$LOG_FILE") -gt 1000 ]; then
      mv "$LOG_FILE" "${LOG_FILE}.old"
      echo "[$(date +'%H:%M:%S')] 🔄 日誌已輪轉 (Log Rotated)." > "$LOG_FILE"
    fi

    echo "[$(date +'%H:%M:%S')] 🔄 偵測到文件變化，執行整合..." >> "$LOG_FILE"    "$SCRIPT_DIR/doc-updater.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/task-kanban-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/activity-feed-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/code-doc-linker.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/alert-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/project-graph-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/project-pulse.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/daily-report-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/context-snapshot-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/strategy-advisory.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/task-sequencer.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/project-roadmap-gen.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/vault-exporter.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/vault-miner.sh" >> "$LOG_FILE" 2>&1

    # 旗艦組件：免疫系統、知識合成、全域導航、經驗提取
    "$SCRIPT_DIR/agent-test-runner.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/knowledge-synthesizer.sh" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/code-navigator.sh" "core" >> "$LOG_FILE" 2>&1
    "$SCRIPT_DIR/lessons-learned-gen.sh" >> "$LOG_FILE" 2>&1
    }}

echo "🚀 Workspace Watcher 啟動中..."
echo "📂 監聽目錄: $DOC_DIR"
echo "📂 監聽目錄: $OBSIDIAN_DIR"
echo "📝 日誌位置: $LOG_FILE"

# Initial update
trigger_update

# Check if fswatch is installed
if command -v fswatch >/dev/null 2>&1; then
  echo "✅ 使用 fswatch 進行實時監聽..."
  fswatch -o "$DOC_DIR" "$OBSIDIAN_DIR" | while read num; do
    # Debounce: prevent rapid multiple triggers
    sleep 2
    trigger_update
  done
else
  echo "⚠️ 未找到 fswatch，切換至輕量級輪询模式 (10s)..."
  last_hash=""
  while true; do
    current_hash=$(find "$DOC_DIR" "$OBSIDIAN_DIR" -maxdepth 2 -name "*.md" -mmin -1 2>/dev/null | wc -l)
    if [ "$current_hash" != "$last_hash" ] && [ "$current_hash" -gt 0 ]; then
      trigger_update
      last_hash="$current_hash"
    fi
    sleep 10
  done
fi
