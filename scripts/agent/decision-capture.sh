#!/bin/bash

# ============================================
# Smart Decision Capture (ADR 2.0) for YD 2026
# Automatically captures architectural or logic decisions.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/../.."
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

LOCAL_DECISION_DIR="$WORKSPACE_ROOT/docs/decisions"
OBSIDIAN_DECISION_DIR="$WORKSPACE_ROOT/obsidian/projects/workspace-docs/decisions"

ensure_dir "$LOCAL_DECISION_DIR"
ensure_dir "$OBSIDIAN_DECISION_DIR"

TITLE="$1"
CONTENT="$2"
CONTEXT="${3:-"Manual session input"}"

if [ -z "$TITLE" ] || [ -z "$CONTENT" ]; then
  echo "Usage: decision-capture.sh \"<Title>\" \"<Core Decision Content>\" [\"Context\"]"
  exit 1
fi

ID=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g' | sed 's/[^a-z0-9-]//g')
DATE=$(date +'%Y-%m-%d')
FILENAME="ADR-${DATE}-${ID}.md"

# 1. Draft the ADR
generate_adr() {
  cat <<EOF
# ADR: $TITLE
*Date: $DATE | Status: ACCEPTED*

---

## 🏷️ Context (背景)
$CONTEXT

## 💡 Decision (決策)
$CONTENT

## 🏗️ Impacted Area (影響範圍)
$(git diff --stat HEAD^..HEAD 2>/dev/null || echo "Current uncommitted changes")

## ⚖️ Consequences (後果)
- **Positive**: 確保了架構的一致性與自動化記錄。
- **Note**: 本決策由 Agent 自動捕獲並同步至 Obsidian。

---
tags: [workspace/decision, auto-captured]
EOF
}

# 2. Persist to both locations
ADR_CONTENT=$(generate_adr)
echo "$ADR_CONTENT" > "$LOCAL_DECISION_DIR/$FILENAME"
echo "$ADR_CONTENT" > "$OBSIDIAN_DECISION_DIR/$FILENAME"

echo "✅ ADR Capture Complete: $FILENAME"
echo "📍 Workspace: docs/decisions/$FILENAME"
echo "📍 Obsidian: obsidian/.../decisions/$FILENAME"
