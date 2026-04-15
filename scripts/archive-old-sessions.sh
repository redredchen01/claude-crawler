#!/usr/bin/env bash
# archive-old-sessions.sh — Archive session_*.md files older than 14 days
# Safe: only moves files, never deletes. Idempotent.

set -euo pipefail

DAYS=14
DRY_RUN=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --days=*) DAYS="${arg#--days=}" ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--days=N]"
      echo "  --dry-run   Show what would be archived without doing it"
      echo "  --days=N    Archive files older than N days (default: 14)"
      exit 0
      ;;
  esac
done

MEMORY_DIRS=(
  "$HOME/.claude/projects/-Users-dex-YD-2026/memory"
  "$HOME/.claude/projects/-Users-dex-YD-2026-obsidian/memory"
)

ARCHIVED_COUNT=0
NOW=$(date +%s)
CUTOFF=$((NOW - DAYS * 86400))

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

for MEM_DIR in "${MEMORY_DIRS[@]}"; do
  if [[ ! -d "$MEM_DIR" ]]; then
    log "SKIP: $MEM_DIR does not exist"
    continue
  fi

  ARCHIVE_DIR="$MEM_DIR/archived"
  MEMORY_INDEX="$MEM_DIR/MEMORY.md"

  # Collect session files older than N days
  FILES_TO_ARCHIVE=()
  for f in "$MEM_DIR"/session_*.md; do
    [[ -f "$f" ]] || continue

    if [[ "$(uname)" == "Darwin" ]]; then
      FILE_MTIME=$(stat -f %m "$f")
    else
      FILE_MTIME=$(stat -c %Y "$f")
    fi

    if (( FILE_MTIME < CUTOFF )); then
      FILES_TO_ARCHIVE+=("$f")
    fi
  done

  if [[ ${#FILES_TO_ARCHIVE[@]} -eq 0 ]]; then
    log "OK: No old session files in $MEM_DIR"
    continue
  fi

  log "Found ${#FILES_TO_ARCHIVE[@]} session file(s) to archive in $MEM_DIR"

  # Create archive dir if needed
  if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$ARCHIVE_DIR"
  fi

  for f in "${FILES_TO_ARCHIVE[@]}"; do
    BASENAME=$(basename "$f")
    if [[ "$DRY_RUN" == true ]]; then
      log "DRY-RUN: Would archive $BASENAME"
    else
      mv "$f" "$ARCHIVE_DIR/$BASENAME"
      log "ARCHIVED: $BASENAME → archived/"
      ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))

      # Remove references from MEMORY.md
      if [[ -f "$MEMORY_INDEX" ]]; then
        # Remove lines that reference this file (markdown links)
        if grep -q "$BASENAME" "$MEMORY_INDEX" 2>/dev/null; then
          # Use sed to remove lines containing the filename
          if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "/$BASENAME/d" "$MEMORY_INDEX"
          else
            sed -i "/$BASENAME/d" "$MEMORY_INDEX"
          fi
          log "CLEANED: Removed $BASENAME reference from MEMORY.md"
        fi
      fi
    fi
  done
done

if [[ "$DRY_RUN" == true ]]; then
  log "DRY-RUN complete. No files were moved."
else
  log "Done. Archived $ARCHIVED_COUNT session file(s)."
fi
