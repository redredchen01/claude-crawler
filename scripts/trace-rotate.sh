#!/bin/bash
# trace-rotate.sh — Rotate trace.jsonl monthly, keep last 3 months
# Run on the 1st of each month (or manually)

set -euo pipefail

TRACE_DIR="${HOME}/.claude"
TRACE_FILE="${TRACE_DIR}/trace.jsonl"

# Get last month's YYYY-MM
if [[ "$(uname)" == "Darwin" ]]; then
  LAST_MONTH=$(date -v-1m +%Y-%m)
else
  LAST_MONTH=$(date -d "last month" +%Y-%m)
fi

ARCHIVE="${TRACE_DIR}/trace-${LAST_MONTH}.jsonl"

# Rotate current trace to archive
if [ -f "$TRACE_FILE" ] && [ -s "$TRACE_FILE" ]; then
  if [ -f "$ARCHIVE" ]; then
    # Append to existing archive if already rotated this month
    cat "$TRACE_FILE" >> "$ARCHIVE"
    echo "Appended to existing archive: $ARCHIVE"
  else
    mv "$TRACE_FILE" "$ARCHIVE"
    echo "Archived: $TRACE_FILE -> $ARCHIVE"
  fi
  touch "$TRACE_FILE"
  echo "Created fresh: $TRACE_FILE"
else
  echo "Nothing to rotate (trace.jsonl empty or missing)"
fi

# Clean up archives older than 3 months
DELETED=0
for f in "${TRACE_DIR}"/trace-*.jsonl; do
  [ -f "$f" ] || continue
  # Extract YYYY-MM from filename
  FNAME=$(basename "$f")
  FILE_MONTH="${FNAME#trace-}"
  FILE_MONTH="${FILE_MONTH%.jsonl}"

  # Calculate 3 months ago
  if [[ "$(uname)" == "Darwin" ]]; then
    CUTOFF=$(date -v-3m +%Y-%m)
  else
    CUTOFF=$(date -d "3 months ago" +%Y-%m)
  fi

  if [[ "$FILE_MONTH" < "$CUTOFF" ]]; then
    rm "$f"
    echo "Deleted old archive: $f"
    DELETED=$((DELETED + 1))
  fi
done

echo "Rotation complete. Deleted $DELETED old archive(s)."
