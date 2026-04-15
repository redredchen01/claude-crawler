#!/bin/bash
# Monthly Obsidian automation: review + health + duplicates + sync
set -e

VAULT='/Users/dex/YD 2026/obsidian'
export PATH="/Users/dex/.local/bin:/usr/local/bin:$PATH"

# 1. Generate monthly review
clausidian review monthly --vault "$VAULT" 2>/dev/null || true

# 2. Health check
clausidian health --vault "$VAULT" 2>/dev/null

# 3. Find duplicates
echo "--- Duplicates ---"
clausidian duplicates --vault "$VAULT" 2>/dev/null || true

# 4. Sync indexes
clausidian sync --vault "$VAULT" 2>/dev/null || true

# 5. Auto-commit if changes
cd "$VAULT"
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "monthly: review + health + duplicates $(date +%Y-%m-%d)" 2>/dev/null || true
fi
