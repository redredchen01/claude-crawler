#!/bin/bash
set -euo pipefail

# L4 Weekly Metrics Rollup
# Aggregates 7 days of health data + commits into JSON
# Outputs: ~/.claude/weekly-metrics-YYYY-W<WW>.json

WEEK=$(date "+%Y-W%U")
METRICS_FILE="$HOME/.claude/weekly-metrics-${WEEK}.json"

# Idempotency check
if [ -f "$METRICS_FILE" ]; then
  echo "[INFO] Metrics already rolled up for $WEEK, skipping"
  exit 0
fi

# Initialize accumulators
HEALTH_SCORES=()
HEALTH_SUM=0
HEALTH_MIN=100
HEALTH_MAX=0
HEALTH_COUNT=0
ORPHANS_SCORES=()
ORPHANS_SUM=0
ORPHANS_COUNT=0

# Collect health data from last 7 days
for i in {0..6}; do
  DATE=$(date -u -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -u -v-${i}d '+%Y-%m-%d')
  HEALTH_FILE="$HOME/.claude/daily-health-${DATE}.json"

  if [ -f "$HEALTH_FILE" ]; then
    SCORE=$(jq -r '.overall_score // 0' "$HEALTH_FILE" 2>/dev/null || echo "0")
    SCORE_INT=$(printf "%.0f" "$SCORE")

    HEALTH_SCORES+=("$SCORE_INT")
    HEALTH_SUM=$((HEALTH_SUM + SCORE_INT))
    HEALTH_COUNT=$((HEALTH_COUNT + 1))

    if [ "$SCORE_INT" -lt "$HEALTH_MIN" ]; then HEALTH_MIN=$SCORE_INT; fi
    if [ "$SCORE_INT" -gt "$HEALTH_MAX" ]; then HEALTH_MAX=$SCORE_INT; fi

    # Also collect orphans data
    ORPHANS=$(jq -r '.vault.orphans // 0' "$HEALTH_FILE" 2>/dev/null || echo "0")
    ORPHANS_INT=$(printf "%.0f" "$ORPHANS")
    ORPHANS_SCORES+=("$ORPHANS_INT")
    ORPHANS_SUM=$((ORPHANS_SUM + ORPHANS_INT))
    ORPHANS_COUNT=$((ORPHANS_COUNT + 1))
  fi
done

# Calculate averages
HEALTH_AVG=0
if [ $HEALTH_COUNT -gt 0 ]; then
  HEALTH_AVG=$((HEALTH_SUM / HEALTH_COUNT))
fi

ORPHANS_AVG=0
if [ $ORPHANS_COUNT -gt 0 ]; then
  ORPHANS_AVG=$((ORPHANS_SUM / ORPHANS_COUNT))
fi

# Count commits (last 7 days)
COMMIT_COUNT=$(git log --since='7 days ago' --oneline 2>/dev/null | wc -l)

# Generate timestamp
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Build JSON
cat > "$METRICS_FILE" << EOF
{
  "week": "$WEEK",
  "generated": "$TIMESTAMP",
  "health": {
    "avg": $HEALTH_AVG,
    "min": $HEALTH_MIN,
    "max": $HEALTH_MAX,
    "data_points": $HEALTH_COUNT
  },
  "commits": {
    "total": $COMMIT_COUNT
  },
  "vault": {
    "orphans_avg": $ORPHANS_AVG,
    "orphans_data_points": $ORPHANS_COUNT
  }
}
EOF

echo "[INFO] Metrics rolled up: $METRICS_FILE"
exit 0
