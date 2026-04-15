#!/bin/bash

# Session Wrap — Auto-save context at session end
# Usage: ./session-wrap.sh [optional-summary]

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

WORKSPACE="$WORKSPACE_ROOT"
OBSIDIAN_DIR="$WORKSPACE/obsidian"
SESSION_WRAP_TOKEN_FILE="$HOME/.session-wrap/token"
SESSION_WRAP_API_URL="${SESSION_WRAP_API_URL:-http://localhost:3000}"

TIMESTAMP=$(date +%Y-%m-%d\ %H:%M:%S)
DATE=$(date +%Y%m%d)
SUMMARY="${1:-Auto-wrap at session end}"

AGENT_TYPE=$(detect_agent_type)

echo "🔄 Session Wrap — $TIMESTAMP"
echo ""

# 1. Create session wrap file
echo "📝 Creating session wrap..."
WRAP_FILE="$MEMORY_DIR/session_${DATE}_wrap.md"

cat > "$WRAP_FILE" << EOF
---
name: Session ${DATE} Wrap
description: Auto-generated session summary
type: project
timestamp: $TIMESTAMP
---

# Session ${DATE} — Auto Wrap

## Summary
$SUMMARY

## Obsidian Sync Status
- Files: $(find "$OBSIDIAN_DIR" -type f -name "*.md" | wc -l)
- Last update: $(date -r "$OBSIDIAN_DIR/_index.md" +%Y-%m-%d\ %H:%M:%S 2>/dev/null || echo "Unknown")

## Memory Status
- Files: $(ls -1 "$MEMORY_DIR"/*.md 2>/dev/null | wc -l)
- Size: $(du -sh "$MEMORY_DIR" | cut -f1)

## Next Session Recommendations
- [ ] Load MEMORY.md for context
- [ ] Check project status from Memory
- [ ] Continue from last checkpoint

---
Generated: $TIMESTAMP
EOF

echo "✅ Wrap file: $WRAP_FILE"

# 2. Sync Obsidian content to Memory
echo ""
echo "🔗 Syncing Obsidian → Memory..."
if [ -f "$WORKSPACE/scripts/obsidian-sync.sh" ]; then
    bash "$WORKSPACE/scripts/obsidian-sync.sh" 2>/dev/null || true
fi

# 3. Update MEMORY.md last sync timestamp
echo ""
echo "📋 Updating MEMORY index..."
SYNC_TIME=$(date +%Y-%m-%d\ %H:%M)
safe_sed "s/\*最後更新：.*/\*最後更新：$SYNC_TIME (session-wrap)\*/" "$MEMORY_DIR/MEMORY.md" 2>/dev/null || true

# 4. Create checkpoint
echo ""
echo "✨ Creating checkpoint..."
git -C "$OBSIDIAN_DIR" add -A 2>/dev/null || true
git -C "$OBSIDIAN_DIR" commit -m "session-wrap: checkpoint at $TIMESTAMP" 2>/dev/null || echo "⚠️  Obsidian git: No changes to commit"

echo ""
echo "✅ Session wrap complete!"
echo ""

# 5. Optional: Sync to cloud if logged in
echo ""
echo "☁️  Checking cloud sync..."
if [ -f "$SESSION_WRAP_TOKEN_FILE" ] && [ -n "$(cat "$SESSION_WRAP_TOKEN_FILE" 2>/dev/null)" ]; then
  echo "Found stored token. Syncing to cloud..."

  JWT_TOKEN=$(cat "$SESSION_WRAP_TOKEN_FILE")

  # Calculate metrics for wrap
  MEMORY_SIZE=$(du -sb "$MEMORY_DIR" | cut -f1)
  OBSIDIAN_COUNT=$(find "$OBSIDIAN_DIR" -type f -name "*.md" 2>/dev/null | wc -l)

  # Get agent token
  case "$AGENT_TYPE" in
    claude-code) AGENT_TOKEN="$CLAUDE_CODE_TOKEN" ;;
    cursor) AGENT_TOKEN="$CURSOR_TOKEN" ;;
    windsurf) AGENT_TOKEN="$WINDSURF_TOKEN" ;;
    cline) AGENT_TOKEN="$CLINE_TOKEN" ;;
    aider) AGENT_TOKEN="$AIDER_TOKEN" ;;
    *) AGENT_TOKEN="" ;;
  esac

  # Try to sync wrap to backend
  SYNC_RESPONSE=$(curl -s -X POST "$SESSION_WRAP_API_URL/api/wraps" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "x-claude-token: $AGENT_TOKEN" \
    -d "{
      \"workspaceName\": \"YD 2026\",
      \"summary\": \"$SUMMARY\",
      \"memorySize\": $MEMORY_SIZE,
      \"obsidianFilesCount\": $OBSIDIAN_COUNT,
      \"metadata\": {
        \"agentType\": \"$AGENT_TYPE\",
        \"timestamp\": \"$TIMESTAMP\"
      }
    }" 2>/dev/null)

  if echo "$SYNC_RESPONSE" | grep -q '"success"'; then
    echo "✅ Cloud sync successful"
  else
    echo "⚠️  Cloud sync failed (backend may be offline)"
    echo "   Wrap saved locally at: $WRAP_FILE"
  fi
else
  echo "⚠️  Not logged in. Wrap saved locally only."
  echo "   To enable cloud sync, run: wrap login"
fi

echo ""
echo "Next session checklist:"
echo "  1. Review: cat $WRAP_FILE"
echo "  2. Load: source ~/.zshrc-workspace"
echo "  3. Status: cat $MEMORY_DIR/MEMORY.md"
echo "  4. Login: wrap login (for cloud sync)"
