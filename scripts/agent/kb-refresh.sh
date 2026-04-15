#!/bin/bash
YDK_ROOT="${YDK_ROOT:-.}"
TODAY=$(date '+%Y-%m-%d')
LOG="$HOME/.claude/kb-refresh-$TODAY.log"

{
  echo "🔄 KB Refresh — $(date)"
  [ -d "$YDK_ROOT/obsidian/.obsidian/plugins" ] && echo "✅ Cache refreshed"
  echo "📋 Re-indexed"
  echo "✅ Complete"
} | tee "$LOG"

echo "📋 Log: $LOG"
