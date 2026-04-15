#!/bin/bash
# scripts/lib/core.sh — Shared core logic for YD 2026 scripts

# Get the workspace root (parent of scripts/)
get_workspace_root() {
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  echo "${YD_WORKSPACE:-$script_dir}"
}

WORKSPACE_ROOT=$(get_workspace_root)
LIB_DIR="$WORKSPACE_ROOT/scripts/lib"

# Resolve memory directory
get_memory_dir() {
  local default_mem="$HOME/.claude/projects/-Users-dex-YD-2026/memory"
  local mem=""
  if [ -n "$YD_MEMORY" ]; then
    mem="$YD_MEMORY"
  elif [ -d "$default_mem" ]; then
    mem="$default_mem"
  else
    mem="$WORKSPACE_ROOT/.memory"
  fi
  echo "$mem"
}

MEMORY_DIR=$(get_memory_dir)

# Detect agent type
detect_agent_type() {
  if [ -n "$GEMINI_CLI" ]; then echo "gemini-cli"; return; fi
  if [ -n "$CLAUDE_CODE_TOKEN" ]; then echo "claude-code"; return; fi
  if [ -n "$CURSOR_TOKEN" ]; then echo "cursor"; return; fi
  if [ -n "$WINDSURF_TOKEN" ]; then echo "windsurf"; return; fi
  if [ -n "$CLINE_TOKEN" ]; then echo "cline"; return; fi
  if [ -n "$AIDER_TOKEN" ]; then echo "aider"; return; fi
  echo "unknown"
}

# Cross-platform sed wrapper
# Usage: safe_sed "s/search/replace/g" file
safe_sed() {
  local pattern="$1"
  local file="$2"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$pattern" "$file"
  else
    sed -i "$pattern" "$file"
  fi
}

# Ensure directory exists
ensure_dir() {
  mkdir -p "$1"
}

# Log helper
log_info() { echo -e "\033[0;32m✅\033[0m $1"; }
log_warn() { echo -e "\033[1;33m⚠️\033[0m $1"; }
log_error() { echo -e "\033[0;31m❌\033[0m $1"; exit 1; }
