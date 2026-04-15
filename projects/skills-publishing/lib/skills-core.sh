#!/bin/bash

# ============================================
# Shared Skill Core Library for YD 2026
# ============================================

# --- Notification Helpers ---

# Post JSON to a generic webhook
post_to_webhook() {
  local url="$1"
  local json_payload="$2"
  
  if [ -z "$url" ]; then
    echo "❌ Error: Webhook URL is missing."
    return 1
  fi
  
  curl -s -X POST -H "Content-Type: application/json" -d "$json_payload" "$url"
}

# Slack Specific Notification
send_slack_notification() {
  local webhook="$1"
  local message="$2"
  local payload=$(jq -n --arg msg "$message" '{"text": $msg}')
  post_to_webhook "$webhook" "$payload"
}

# --- Data Processing ---

# Safe JQ extractor
extract_json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | jq -r "$field" 2>/dev/null || echo "null"
}

# --- Status Reporting ---

log_skill_event() {
  local skill_name="$1"
  local status="$2"
  local message="$3"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$skill_name] [$status] $message"
}
