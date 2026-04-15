#!/bin/bash
# scripts/agent/service-watchdog.sh — Site Doctor Skill v0.1
# Monitors domain expiry and service health for OpenClaw.

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

# Domains to monitor (from W14 Weekly Report)
DOMAINS=("xhslink.com" "51acgs.com")
THRESHOLD_DAYS=45

log_info "🩺 Site Doctor — Monitoring Domains & Services..."

check_domain_expiry() {
  local domain=$1
  local expiry_date=""
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS whois output varies, trying to find standard 'expiry' or 'expiration'
    expiry_date=$(whois "$domain" | grep -Ei "Expiration Date|Expiry Date|expires" | head -n 1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" || echo "")
  else
    expiry_date=$(whois "$domain" | grep -Ei "Expiration Date|Expiry Date" | head -n 1 | awk '{print $NF}' | cut -T -d 'T' -f 1 || echo "")
  fi

  if [ -z "$expiry_date" ]; then
    log_warn "  • $domain: Could not determine expiry date via whois."
    return
  fi

  # Calculate days remaining
  local current_ts=$(date +%s)
  local expiry_ts
  if [[ "$OSTYPE" == "darwin"* ]]; then
    expiry_ts=$(date -j -f "%Y-%m-%d" "$expiry_date" "+%s" 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$expiry_date" "+%s" 2>/dev/null || echo 0)
  else
    expiry_ts=$(date -d "$expiry_date" +%s 2>/dev/null || echo 0)
  fi

  if [ "$expiry_ts" -eq 0 ]; then
    log_warn "  • $domain: Failed to parse expiry date ($expiry_date)."
    return
  fi

  local days_left=$(( (expiry_ts - current_ts) / 86400 ))

  if [ "$days_left" -lt "$THRESHOLD_DAYS" ]; then
    echo -e "  \033[0;31m🚨 CRITICAL\033[0m: $domain expires in $days_left days ($expiry_date)!"
    # Save to a temporary alert file for session-wrap to pick up
    echo "DOMAIN_ALERT|$domain|$days_left|$expiry_date" >> /tmp/service_alerts.log
  else
    log_info "  • $domain: OK ($days_left days remaining)"
  fi
}

# Clear old alerts
rm -f /tmp/service_alerts.log

for domain in "${DOMAINS[@]}"; do
  check_domain_expiry "$domain"
done

# Service Health Check (HTTP)
SERVICES=("https://github.com" "http://localhost:3000")
for svc in "${SERVICES[@]}"; do
  if curl -s --head --request GET "$svc" --max-time 5 | grep "200 OK" > /dev/null; then
    log_info "  • $svc: UP"
  else
    log_warn "  • $svc: DOWN or unreachable"
  fi
done

log_info "✅ Service Watchdog check complete."
