#!/bin/bash
# Daily Obsidian automation: create journal + backfill + calendar sync + health check + auto-commit
set -e

VAULT='/Users/dex/YD 2026/obsidian'
export PATH="/Users/dex/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# 1. Create today's journal (idempotent)
clausidian journal --vault "$VAULT" 2>/dev/null || true

# 2. Backfill any missing journals from yesterday
clausidian hook daily-backfill --vault "$VAULT" 2>/dev/null || true

# 3. Sync Google Calendar events to journal
clausidian bridge gcal --vault "$VAULT" 2>/dev/null || true

# 4. Sync indices (includes A5: suggested links)
clausidian sync --vault "$VAULT" 2>/dev/null || true

# 5. A2: Idea lifecycle temperature tracking
clausidian health --vault "$VAULT" --json 2>/dev/null | grep -q '"grade"' && true

# 6. Auto-commit if there are changes
cd "$VAULT"
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "daily: auto-sync $(date +%Y-%m-%d)" 2>/dev/null || true
fi
