#!/bin/bash
set -euo pipefail

# L4 Weekly Retro Generator
# Reads 7 days of docs/daily/*.md + health audit JSON
# Outputs: docs/retro/YYYY-W<WW>.md

WORKSPACE="/Users/dex/YD 2026"
cd "$WORKSPACE"

# Calculate week number and date range
TODAY=$(date '+%Y-%m-%d')
WEEK=$(date "+%Y-W%U")
YEAR=$(date '+%Y')

RETRO_FILE="docs/retro/${WEEK}.md"

# Idempotency check
if [ -f "$RETRO_FILE" ]; then
  echo "[INFO] Retro already generated for $WEEK, skipping"
  exit 0
fi

# Collect health scores from last 7 days
HEALTH_SCORES=()
HEALTH_MIN=100
HEALTH_MAX=0
HEALTH_SUM=0
HEALTH_COUNT=0

for i in {0..6}; do
  DATE=$(date -u -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -u -v-${i}d '+%Y-%m-%d')
  HEALTH_FILE="$HOME/.claude/daily-health-${DATE}.json"

  if [ -f "$HEALTH_FILE" ]; then
    SCORE=$(jq -r '.overall_score // 0' "$HEALTH_FILE" 2>/dev/null || echo "0")
    HEALTH_SCORES+=("$DATE|$SCORE")

    SCORE_INT=$(printf "%.0f" "$SCORE")
    HEALTH_SUM=$((HEALTH_SUM + SCORE_INT))
    HEALTH_COUNT=$((HEALTH_COUNT + 1))

    if [ "$SCORE_INT" -lt "$HEALTH_MIN" ]; then HEALTH_MIN=$SCORE_INT; fi
    if [ "$SCORE_INT" -gt "$HEALTH_MAX" ]; then HEALTH_MAX=$SCORE_INT; fi
  fi
done

# Calculate health stats
HEALTH_AVG=0
if [ $HEALTH_COUNT -gt 0 ]; then
  HEALTH_AVG=$((HEALTH_SUM / HEALTH_COUNT))
fi

# Count commits (last 7 days)
COMMIT_COUNT=$(git log --since='7 days ago' --oneline 2>/dev/null | wc -l)

# Average vault orphans from available health data
ORPHANS_SUM=0
ORPHANS_COUNT=0
for i in {0..6}; do
  DATE=$(date -u -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -u -v-${i}d '+%Y-%m-%d')
  HEALTH_FILE="$HOME/.claude/daily-health-${DATE}.json"

  if [ -f "$HEALTH_FILE" ]; then
    ORPHANS=$(jq -r '.vault.orphans // 0' "$HEALTH_FILE" 2>/dev/null || echo "0")
    ORPHANS_INT=$(printf "%.0f" "$ORPHANS")
    ORPHANS_SUM=$((ORPHANS_SUM + ORPHANS_INT))
    ORPHANS_COUNT=$((ORPHANS_COUNT + 1))
  fi
done

ORPHANS_AVG=0
if [ $ORPHANS_COUNT -gt 0 ]; then
  ORPHANS_AVG=$((ORPHANS_SUM / ORPHANS_COUNT))
fi

# Generate timestamp in ISO-8601 format
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Build health trend table
HEALTH_TABLE_LINES=""
for score_pair in "${HEALTH_SCORES[@]}"; do
  DATE="${score_pair%|*}"
  SCORE="${score_pair#*|}"
  SCORE_INT=$(printf "%.0f" "$SCORE")
  HEALTH_TABLE_LINES="${HEALTH_TABLE_LINES}| $DATE | $SCORE_INT |\n"
done

# Create retro file using here-doc substitution (not templating)
cat > "$RETRO_FILE" << EOF
---
title: "Weekly Retro $WEEK"
week: "$WEEK"
generated: "$TIMESTAMP"
health_avg: $HEALTH_AVG
commits_total: $COMMIT_COUNT
vault_orphans_avg: $ORPHANS_AVG
---

# Weekly Retro $WEEK

## Summary
- Days with health data: $HEALTH_COUNT/7
- Total commits: $COMMIT_COUNT
- Avg health score: $HEALTH_AVG/100
- Avg vault orphans: $ORPHANS_AVG

## Health Trend
| Date | Score |
|------|-------|
EOF

# Add health table rows
for score_pair in "${HEALTH_SCORES[@]}"; do
  DATE="${score_pair%|*}"
  SCORE="${score_pair#*|}"
  SCORE_INT=$(printf "%.0f" "$SCORE")
  echo "| $DATE | $SCORE_INT |" >> "$RETRO_FILE"
done

# Add rest of template
cat >> "$RETRO_FILE" << EOF

## Observations
- Health score range: $HEALTH_MIN-$HEALTH_MAX
- Best day: $HEALTH_MAX/100
- Lowest day: $HEALTH_MIN/100

## Next Week Focus
<!-- auto-placeholder, agent editable -->
- [ ] Monitor vault orphans (currently $ORPHANS_AVG)
- [ ] Review failed L3 tasks if any
EOF

echo "[INFO] Retro generated: $RETRO_FILE"
exit 0
