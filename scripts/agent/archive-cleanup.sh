#!/bin/bash
set -euo pipefail

# L4 Archive Cleanup
# Moves docs/daily/*.md older than 28 days to docs/archive/daily/YYYY/
# Logs: stdout (captured by orchestrator)

WORKSPACE="/Users/dex/YD 2026"
cd "$WORKSPACE"

DAILY_DIR="docs/daily"
ARCHIVE_BASE="docs/archive/daily"

# Ensure archive base exists
mkdir -p "$ARCHIVE_BASE"

# Find files older than 28 days (last modified time)
MOVE_COUNT=0
MOVED_FILES=""

if [ -d "$DAILY_DIR" ]; then
  for file in "$DAILY_DIR"/*.md; do
    [ -f "$file" ] || continue

    # Extract year from filename (YYYY-MM-DD.md)
    FILENAME=$(basename "$file")
    YEAR="${FILENAME:0:4}"

    # Check if file is older than 28 days
    FILE_AGE=$(find "$file" -type f -mtime +28 2>/dev/null | wc -l)

    if [ "$FILE_AGE" -gt 0 ]; then
      # Create year directory if needed
      mkdir -p "$ARCHIVE_BASE/$YEAR"

      # Move file only if not already in archive
      if [ ! -f "$ARCHIVE_BASE/$YEAR/$FILENAME" ]; then
        mv "$file" "$ARCHIVE_BASE/$YEAR/$FILENAME"
        MOVE_COUNT=$((MOVE_COUNT + 1))
        MOVED_FILES="$MOVED_FILES\n  - $FILENAME → $YEAR/"
      fi
    fi
  done
fi

if [ $MOVE_COUNT -gt 0 ]; then
  echo "[INFO] Archived $MOVE_COUNT files:$MOVED_FILES"
else
  echo "[INFO] No files to archive (none older than 28 days)"
fi

exit 0
