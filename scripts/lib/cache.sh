#!/bin/bash
# scripts/lib/cache.sh — Shared caching library for Phase 3 optimization
# Provides standardized JSON cache management for Skills

# Define cache constants
CACHE_TTL_DEFAULT=300 # 5 minutes
CACHE_DIR="/tmp"

# Get cache file path
# Usage: get_cache_path <workflow_name> <provider_name>
get_cache_path() {
  local workflow="${1:-generic}"
  local provider="${2:-vault}"
  echo "$CACHE_DIR/cache_${workflow}_${provider}.json"
}

# Check if cache is valid
# Usage: is_cache_valid <cache_file>
is_cache_valid() {
  local cache_file="$1"

  # 1. File exists?
  [ -f "$cache_file" ] || return 1

  # 2. JSON valid?
  jq empty "$cache_file" 2>/dev/null || return 1

  # 3. Not expired?
  local expires_at=$(jq -r '.__metadata__.expires_at' "$cache_file" 2>/dev/null)
  [ -n "$expires_at" ] || return 1
  
  local now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [[ "$now" < "$expires_at" ]]; then
    return 0
  else
    return 1
  fi
}

# Write data to cache with metadata
# Usage: write_cache <cache_file> <source_name> <json_data>
write_cache() {
  local cache_file="$1"
  local source="$2"
  local data="$3"
  local ttl="${4:-$CACHE_TTL_DEFAULT}"

  local now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # Portable date adjustment
  local expires_at
  if [[ "$OSTYPE" == "darwin"* ]]; then
    expires_at=$(date -u -v+${ttl}S +%Y-%m-%dT%H:%M:%SZ)
  else
    expires_at=$(date -u -d "+$ttl seconds" +%Y-%m-%dT%H:%M:%SZ)
  fi

  jq -n \
    --arg now "$now" \
    --arg expires "$expires_at" \
    --arg ttl "$ttl" \
    --arg source "$source" \
    --argjson payload "$data" \
    '{
      "__metadata__": {
        "version": "1.0",
        "source": $source,
        "timestamp": $now,
        "expires_at": $expires,
        "ttl_seconds": ($ttl | tonumber)
      },
      "data": $payload
    }' > "$cache_file"
}

# Metrics Management
METRICS_FILE="$CACHE_DIR/workspace_metrics.jsonl"

# Report a metric
# Usage: report_metric <type> <name> <value> <status> [metadata_json]
report_metric() {
  local type="$1"
  local name="$2"
  local value="$3"
  local status="$4"
  local meta="${5:-"{}"}"
  
  # Ensure meta is valid JSON, fallback to string if not
  if ! echo "$meta" | jq -e . >/dev/null 2>&1; then
    meta=$(jq -n --arg m "$meta" '{"info": $m}')
  fi
  
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  jq -n \
    --arg ts "$timestamp" \
    --arg type "$type" \
    --arg name "$name" \
    --arg val "$value" \
    --arg status "$status" \
    --argjson meta "$meta" \
    '{
      "timestamp": $ts,
      "type": $type,
      "name": $name,
      "value": ($val | tonumber),
      "status": $status,
      "metadata": $meta
    }' >> "$METRICS_FILE"
}

# Export cache for subprocesses
# Usage: export_cache <cache_file>
export_cache() {
  export VAULT_QUERY_CACHE="$1"
}
