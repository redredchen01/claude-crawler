#!/bin/bash
VERSION="${1:-}"
PACKAGE="${2:-yd-utility-kit}"
STATUS="${3:-success}"

if [ -z "$VERSION" ]; then
  echo "❌ Usage: $0 <version> <package> [status]"
  exit 1
fi

DOCS_DIR="$(cd "$(dirname "$0")/../../docs" && pwd)"
mkdir -p "$DOCS_DIR"
PUBLISH_LOG="$DOCS_DIR/publish-history.jsonl"

TIMESTAMP=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
COMMIT_MSG="${GITHUB_COMMIT_MESSAGE:-$(git log -1 --pretty=format:%s 2>/dev/null || echo 'N/A')}"
ACTOR="${GITHUB_ACTOR:-unknown}"

JSON_RECORD="{\"ts\":\"$TIMESTAMP\",\"version\":\"$VERSION\",\"package\":\"$PACKAGE\",\"status\":\"$STATUS\",\"commit\":\"$COMMIT_SHA\",\"message\":\"$COMMIT_MSG\",\"actor\":\"$ACTOR\"}"

echo "$JSON_RECORD" >> "$PUBLISH_LOG"
echo "✅ Published: $PACKAGE v$VERSION at $TIMESTAMP"
echo "   Log: $PUBLISH_LOG"
