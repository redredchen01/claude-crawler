#!/bin/bash
# @docs [ARCHITECTURE.md]
# agent-tasks.sh — Task dependency graph for multi-agent coordination
# Usage: agent-tasks add <id> <description> [depends-on...]
#        agent-tasks done <id>
#        agent-tasks next
#        agent-tasks status
#        agent-tasks claim <id> [agent-id]

set -e

# Load core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib/core.sh"

TASKS_DIR="$MEMORY_DIR/tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"
LOCK_DIR="$TASKS_DIR/.tasks.lock"

ensure_dir "$TASKS_DIR"

# Initialize tasks file if not exists
if [ ! -f "$TASKS_FILE" ]; then
  echo '{"tasks": {}}' > "$TASKS_FILE"
fi

# ============================================
# Locking Mechanism
# ============================================

acquire_lock() {
  local max_retries=10
  local count=0
  
  # Stale lock cleanup (if older than 60s)
  if [ -d "$LOCK_DIR" ]; then
    local now=$(date +%s)
    local lock_time
    if [[ "$OSTYPE" == "darwin"* ]]; then
      lock_time=$(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0)
    else
      lock_time=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0)
    fi
    
    if (( now - lock_time > 60 )); then
      rm -rf "$LOCK_DIR"
    fi
  fi

  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [ $count -ge $max_retries ]; then
      log_error "Failed to acquire task lock after ${max_retries}s. Manual cleanup: rm -rf $LOCK_DIR"
    fi
    sleep 1
    ((count++))
  done
  
  # Release lock on exit
  trap release_lock EXIT
}

release_lock() {
  rm -rf "$LOCK_DIR" 2>/dev/null
}

# ============================================
# Commands
# ============================================

# Add a task
cmd_add() {
  local id="$1"
  local description="$2"
  shift 2
  local depends_on=("$@")

  if [ -z "$id" ] || [ -z "$description" ]; then
    log_error "Usage: agent-tasks add <id> <description> [depends-on...]"
  fi

  acquire_lock
  trap release_lock EXIT

  local created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  # Build deps JSON safely
  local deps_json="[]"
  if [ ${#depends_on[@]} -gt 0 ]; then
    deps_json=$(printf '%s\n' "${depends_on[@]}" | jq -R . | jq -s .)
  fi

  local tmp=$(mktemp)
  jq --arg id "$id" \
     --arg desc "$description" \
     --arg created "$created_at" \
     --argjson deps "$deps_json" \
     '.tasks[$id] = {"description": $desc, "status": "pending", "depends_on": $deps, "assigned_to": null, "created_at": $created}' \
     "$TASKS_FILE" > "$tmp"
  mv "$tmp" "$TASKS_FILE"

  log_info "Added task: $id"
}

# Mark task as done
cmd_done() {
  local id="$1"
  if [ -z "$id" ]; then log_error "Usage: agent-tasks done <id>"; fi

  acquire_lock
  trap release_lock EXIT

  local tmp=$(mktemp)
  jq --arg id "$id" '.tasks[$id].status = "done"' "$TASKS_FILE" > "$tmp"
  mv "$tmp" "$TASKS_FILE"
  log_info "Marked complete: $id"

  # Trigger Decision Capture
  "$(dirname "$0")/decision-capture.sh" "$id"

  # Push to Telegram
  "$(dirname "$0")/tg-notifier.sh" "✅ <b>任務完成！</b>\n🆔 ID: <code>$id</code>\n📅 專案: YD 2026\n🔗 決策日誌已存入 Obsidian。"

  # Trigger Git Flow Automation
  "$(dirname "$0")/git-flow-manager.sh" "$id"
}
# Find next executable tasks (all dependencies met)
cmd_next() {
  echo "🚀 Next Executable Tasks:"
  echo ""

  if [ ! -f "$TASKS_FILE" ]; then
    echo "   (no tasks yet)"
    return
  fi

  # Optimized single jq call to find ready tasks
  jq -r '
    .tasks as $all 
    | to_entries[] 
    | select(.value.status == "pending") 
    | .key as $k 
    | .value as $v 
    | select([$v.depends_on[] | $all[.].status == "done"] | all) 
    | "\($k)|\($v.description)|\($v.assigned_to)"' "$TASKS_FILE" | while IFS='|' read id desc assigned; do
    
    if [ "$assigned" = "null" ]; then
      echo "   □ $id: $desc"
    else
      echo "   ◆ $id: $desc [assigned to: $assigned]"
    fi
  done
  echo ""
}

# Show full status
cmd_status() {
  echo "📊 Task Graph Status:"
  echo ""

  if [ ! -f "$TASKS_FILE" ]; then
    echo "   (no tasks yet)"
    return
  fi

  jq -r '
    (.tasks | to_entries | map(select(.value.status == "pending")) | length) as $p |
    (.tasks | to_entries | map(select(.value.status == "done")) | length) as $d |
    "Total: \($p + $d) tasks\n  ✓ Done: \($d)\n  ○ Pending: \($p)\n"
  ' "$TASKS_FILE"

  jq -r '.tasks | to_entries[] | "\(.key): \(.value.description) [\(.value.status)]"' "$TASKS_FILE"
}

# Claim a task
cmd_claim() {
  local id="$1"
  local agent="${2:-$(detect_agent_type)}"
  if [ -z "$id" ]; then log_error "Usage: agent-tasks claim <id> [agent-id]"; fi

  acquire_lock
  trap release_lock EXIT

  local tmp=$(mktemp)
  jq --arg id "$id" --arg agent "$agent" '.tasks[$id].assigned_to = $agent' "$TASKS_FILE" > "$tmp"
  mv "$tmp" "$TASKS_FILE"

  log_info "Claimed by: $agent"
}

# Main dispatch
case "${1:-}" in
  add)   cmd_add "$2" "$3" "${@:4}" ;;
  done)  cmd_done "$2" ;;
  next)  cmd_next ;;
  status) cmd_status ;;
  claim) cmd_claim "$2" "$3" ;;
  *)
    echo "Usage:"
    echo "  agent-tasks add <id> <description> [depends...]  — add task"
    echo "  agent-tasks done <id>                            — mark complete"
    echo "  agent-tasks next                                 — show next executable tasks"
    echo "  agent-tasks status                               — show full task graph"
    echo "  agent-tasks claim <id> [agent-id]                — claim a task"
    exit 1
    ;;
esac

