#!/bin/bash
set -euo pipefail

YDK_ROOT="${YDK_ROOT:-.}"
DOCS_DIR="$YDK_ROOT/docs"
DAILY_DIR="$DOCS_DIR/daily"
TODAY=$(date '+%Y-%m-%d')
DAILY_FILE="$DAILY_DIR/$TODAY.md"

mkdir -p "$DAILY_DIR"
[ -f "$DAILY_FILE" ] && { echo "📝 Feed exists for $TODAY"; exit 0; }

COMMIT_COUNT=$(git log --oneline --since="24 hours ago" 2>/dev/null | wc -l || echo "0")
FILES_CHANGED=$(git log --name-only --since="24 hours ago" 2>/dev/null | grep -c "^[a-zA-Z]" || echo "0")
GIT_LOG=$(git log --oneline --since="24 hours ago" --pretty=format:"- %h — %s (%an)" 2>/dev/null | head -20 || echo "- (no commits)")
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

cat > "$DAILY_FILE" <<DAILY
---
title: Daily Activity Feed
date: $TODAY
---

# Daily Activity — $TODAY

## 📊 Summary
- **Commits**: $COMMIT_COUNT
- **Files**: $FILES_CHANGED
- **Status**: Normal

## 🔧 Git Activity

$GIT_LOG

---
*Generated: $TIMESTAMP*
DAILY

echo "✅ Activity feed: $DAILY_FILE"
echo "   Commits: $COMMIT_COUNT | Files: $FILES_CHANGED"
