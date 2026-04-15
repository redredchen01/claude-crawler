#!/bin/bash
# trace-report.sh — Read ~/.claude/trace.jsonl and output summary stats
# Usage: trace-report.sh [--last=N] [--agent=<name>]
#   --last=N       Show last N days (default: 7)
#   --agent=<name> Filter by agent name

set -euo pipefail

TRACE_FILE="${HOME}/.claude/trace.jsonl"
LAST_DAYS=7
AGENT_FILTER=""

for arg in "$@"; do
  case "$arg" in
    --last=*) LAST_DAYS="${arg#--last=}" ;;
    --agent=*) AGENT_FILTER="${arg#--agent=}" ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [ ! -f "$TRACE_FILE" ] || [ ! -s "$TRACE_FILE" ]; then
  echo "No trace data found at $TRACE_FILE"
  exit 0
fi

# Calculate cutoff date
if [[ "$(uname)" == "Darwin" ]]; then
  CUTOFF=$(date -u -v-${LAST_DAYS}d +%Y-%m-%dT%H:%M:%SZ)
else
  CUTOFF=$(date -u -d "${LAST_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
fi

# Build jq filter
JQ_FILTER='[.[] | select(.ts >= $cutoff)'
if [ -n "$AGENT_FILTER" ]; then
  JQ_FILTER="${JQ_FILTER} | select(.agent == \$agent)"
fi
JQ_FILTER="${JQ_FILTER}]"

JQ_ARGS=(--arg cutoff "$CUTOFF")
if [ -n "$AGENT_FILTER" ]; then
  JQ_ARGS+=(--arg agent "$AGENT_FILTER")
fi

# Run report
jq -s "${JQ_ARGS[@]}" "$JQ_FILTER" "$TRACE_FILE" | jq '
  if length == 0 then
    "No trace entries found for the specified period." | halt_error(0)
  else
    . as $all |
    {
      period: {last_days: ($cutoff | tostring), entries: ($all | length)},
      totals: {
        total_calls: ($all | length),
        success: ([$all[] | select(.status == "success")] | length),
        failure: ([$all[] | select(.status == "failure")] | length),
        timeout: ([$all[] | select(.status == "timeout")] | length),
        fallback: ([$all[] | select(.status == "fallback")] | length),
        success_rate: (([$all[] | select(.status == "success")] | length) * 100.0 / ($all | length) | floor | tostring + "%")
      },
      avg_duration_ms: ([$all[].duration_ms] | add / length | floor),
      per_agent: (
        $all | group_by(.agent) | map({
          agent: .[0].agent,
          calls: length,
          success: ([.[] | select(.status == "success")] | length),
          success_rate: (([.[] | select(.status == "success")] | length) * 100.0 / length | floor | tostring + "%"),
          avg_ms: ([.[].duration_ms] | add / length | floor)
        }) | sort_by(-.calls)
      )
    }
  end
' --arg cutoff "$CUTOFF"
