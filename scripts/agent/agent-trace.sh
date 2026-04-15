#!/bin/bash
# agent-trace.sh — Append a trace event to ~/.claude/trace.jsonl
# Usage: ./agent-trace.sh <agent> <task> <status> <summary> [duration_ms] [tokens_in] [tokens_out]

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

TRACE_DIR="$MEMORY_DIR/trace"
ensure_dir "$TRACE_DIR"
TRACE_FILE="$TRACE_DIR/trace.jsonl"

AGENT=${1:-"unknown"}
TASK=${2:-"generic"}
STATUS=${3:-"success"}
SUMMARY=${4:-""}
DURATION=${5:-0}
T_IN=${6:-0}
T_OUT=${7:-0}

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape quotes in summary
SUMMARY_ESC=$(echo "$SUMMARY" | sed 's/"/\\"/g')

JSON="{\"ts\":\"$TS\",\"agent\":\"$AGENT\",\"task\":\"$TASK\",\"status\":\"$STATUS\",\"summary\":\"$SUMMARY_ESC\",\"duration_ms\":$DURATION,\"tokens_in\":$T_IN,\"tokens_out\":$T_OUT}"

echo "$JSON" >> "$TRACE_FILE"
