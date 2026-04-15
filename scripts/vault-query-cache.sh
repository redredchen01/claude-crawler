#!/bin/bash
# vault-query-cache — Cache provider for vault metadata
# Refactored to use scripts/lib/cache.sh

set -euo pipefail

# 1. Environment and Paths
WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/cache.sh"

CLAUSIDIAN_BIN="$WORKSPACE_ROOT/projects/tools/clausidian/bin/cli.mjs"
OA_VAULT="${OA_VAULT:-$WORKSPACE_ROOT/obsidian}"
WORKFLOW_NAME="${WORKFLOW_NAME:-generic}"
FORCE_REFRESH="${FORCE_REFRESH:-0}"

CACHE_FILE=$(get_cache_path "$WORKFLOW_NAME" "vault")

# Helper for JSON output
clausidian() {
  (cd "$OA_VAULT" && node "$CLAUSIDIAN_BIN" "$@" --json)
}

log() {
  echo "[vault-cache] $1" >&2
}

# 2. Check existing cache
if [[ "$FORCE_REFRESH" -eq 0 ]] && is_cache_valid "$CACHE_FILE"; then
  log "Using valid cache: $CACHE_FILE"
  echo "$CACHE_FILE"
  exit 0
fi

# 3. Fetch data from Clausidian
log "Fetching fresh vault data..."
stats=$(clausidian stats)
# Map .file to .name for compatibility with vault-progress-sync and other skills
projects=$(clausidian list --type project --status active | jq '.notes | map(. + {name: .file})')
recent=$(clausidian recent 10 | jq '.notes | map(. + {name: .file})')
tags=$(clausidian tag list)

# 4. Assemble payload
payload=$(jq -n \
  --argjson stats "$stats" \
  --argjson projects "$projects" \
  --argjson recent "$recent" \
  --argjson tags "$tags" \
  '{
    "stats": $stats,
    "projects": $projects,
    "recent": $recent,
    "tags": $tags
  }')

# 5. Write to cache
write_cache "$CACHE_FILE" "vault-query-cache" "$payload"
log "Cache refreshed: $CACHE_FILE"

# 6. Output for orchestrator
echo "$CACHE_FILE"
