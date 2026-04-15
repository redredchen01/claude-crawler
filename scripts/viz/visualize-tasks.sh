#!/bin/bash

# Visualize Task Dependency Graph
# Generates a colorful ASCII visualization of task dependencies and status

export YD_MEMORY="${YD_MEMORY:-$HOME/.claude/projects/-Users-dex-YD-2026/memory}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m'

# Check if tasks.json exists
if [ ! -f "$YD_MEMORY/tasks/tasks.json" ]; then
  echo -e "${RED}❌ No tasks found. Run: agent-tasks add \"task-id\" \"description\"${NC}"
  exit 1
fi

# Get total stats
TOTAL=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
DONE=$(jq '[.tasks[] | select(.status == "done")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
PENDING=$(jq '[.tasks[] | select(.status == "pending")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
IN_PROGRESS=$(jq '[.tasks[] | select(.status == "in_progress")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)

PROGRESS=$((DONE * 100 / TOTAL))

# Header
echo ""
echo -e "${BOLD}${BLUE}📊 TASK DEPENDENCY GRAPH${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Progress bar
echo -n "Progress: "
for ((i=0; i<PROGRESS; i+=10)); do
  echo -n "█"
done
for ((i=PROGRESS; i<100; i+=10)); do
  echo -n "░"
done
echo -e " ${PROGRESS}% (${DONE}/${TOTAL})"
echo ""

# Stats
echo -e "${GREEN}✅ Done:${NC}        $DONE"
echo -e "${CYAN}⏳ In Progress:${NC} $IN_PROGRESS"
echo -e "${YELLOW}⭐ Pending:${NC}    $PENDING"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Print tasks by status
echo -e "${BOLD}COMPLETED TASKS${NC}"
echo "───────────────────────────────────────────────────────────────"

jq -r '.tasks[] | select(.status == "done") | "\(.id)\t\(.description)"' "$YD_MEMORY/tasks/tasks.json" | while read -r id desc; do
  echo -e "  ${GREEN}✅${NC} ${BOLD}$id${NC}"
  echo -e "     $desc"
done

echo ""
echo -e "${BOLD}IN PROGRESS${NC}"
echo "───────────────────────────────────────────────────────────────"

jq -r '.tasks[] | select(.status == "in_progress") | "\(.id)\t\(.description)\t\(.assigned_to // "unassigned")"' "$YD_MEMORY/tasks/tasks.json" | while read -r id desc assigned; do
  echo -e "  ${CYAN}⏳${NC} ${BOLD}$id${NC} ${GRAY}(assigned to: $assigned)${NC}"
  echo -e "     $desc"
done

echo ""
echo -e "${BOLD}PENDING TASKS${NC}"
echo "───────────────────────────────────────────────────────────────"

# Helper function to check if task is blocked
is_blocked() {
  local task_id=$1
  local deps=$(jq -r ".tasks[\"$task_id\"].depends_on[]?" "$YD_MEMORY/tasks/tasks.json" 2>/dev/null)

  if [ -z "$deps" ]; then
    return 1  # not blocked
  fi

  for dep in $deps; do
    local dep_status=$(jq -r ".tasks[\"$dep\"].status // \"pending\"" "$YD_MEMORY/tasks/tasks.json" 2>/dev/null)
    if [ "$dep_status" != "done" ]; then
      return 0  # is blocked
    fi
  done

  return 1  # not blocked
}

# Print pending tasks with dependency info
jq -r '.tasks[] | select(.status == "pending") | "\(.id)\t\(.description)\t\(.depends_on // "" | @csv)"' "$YD_MEMORY/tasks/tasks.json" | while IFS=$'\t' read -r id desc deps_json; do
  deps=$(echo "$deps_json" | sed 's/["\\]//g')

  if [ -z "$deps" ] || [ "$deps" = "\"\"" ]; then
    # No dependencies - ready to start
    echo -e "  ${YELLOW}⭐${NC} ${BOLD}$id${NC} ${GREEN}(ready to start)${NC}"
    echo -e "     $desc"
  else
    # Has dependencies
    echo -e "  ${YELLOW}⭐${NC} ${BOLD}$id${NC} ${RED}(blocked on: $deps)${NC}"
    echo -e "     $desc"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Dependency tree visualization
echo -e "${BOLD}DEPENDENCY TREE${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Build tree structure
jq -r '.tasks[] | select(.depends_on == null or (.depends_on | length) == 0) | .id' "$YD_MEMORY/tasks/tasks.json" | while read -r root_task; do
  root_status=$(jq -r ".tasks[\"$root_task\"].status" "$YD_MEMORY/tasks/tasks.json")

  case $root_status in
    done)
      root_icon="${GREEN}✅${NC}"
      ;;
    in_progress)
      root_icon="${CYAN}⏳${NC}"
      ;;
    *)
      root_icon="${YELLOW}⭐${NC}"
      ;;
  esac

  echo -e "  ${root_icon} ${BOLD}$root_task${NC}"

  # Find tasks that depend on this one
  dependents=$(jq -r ".tasks[] | select(.depends_on[]? == \"$root_task\") | .id" "$YD_MEMORY/tasks/tasks.json")

  if [ ! -z "$dependents" ]; then
    echo "$dependents" | while read -r dep_task; do
      dep_status=$(jq -r ".tasks[\"$dep_task\"].status" "$YD_MEMORY/tasks/tasks.json")

      case $dep_status in
        done)
          dep_icon="${GREEN}✅${NC}"
          ;;
        in_progress)
          dep_icon="${CYAN}⏳${NC}"
          ;;
        *)
          dep_icon="${YELLOW}⭐${NC}"
          ;;
      esac

      echo -e "     ├─ ${dep_icon} $dep_task"
    done
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Agent assignments
echo -e "${BOLD}AGENT ASSIGNMENTS${NC}"
echo "───────────────────────────────────────────────────────────────"

agents=$(jq -r '.tasks[] | select(.assigned_to != null) | .assigned_to' "$YD_MEMORY/tasks/tasks.json" | sort -u)

if [ -z "$agents" ]; then
  echo "No tasks assigned yet"
else
  echo "$agents" | while read -r agent; do
    task_count=$(jq "[.tasks[] | select(.assigned_to == \"$agent\")] | length" "$YD_MEMORY/tasks/tasks.json")
    done_count=$(jq "[.tasks[] | select(.assigned_to == \"$agent\" and .status == \"done\")] | length" "$YD_MEMORY/tasks/tasks.json")

    echo -e "  ${CYAN}🤖${NC} ${BOLD}$agent${NC}: $done_count/$task_count tasks complete"

    jq -r ".tasks[] | select(.assigned_to == \"$agent\") | \"    - \\(.id): \\(.status)\"" "$YD_MEMORY/tasks/tasks.json"
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Next actions
echo -e "${BOLD}NEXT ACTIONS${NC}"
echo "───────────────────────────────────────────────────────────────"

ready_tasks=$(jq -r '.tasks[] | select(.status == "pending" and (.depends_on == null or (.depends_on | length) == 0)) | .id' "$YD_MEMORY/tasks/tasks.json")

if [ -z "$ready_tasks" ]; then
  echo -e "${YELLOW}No tasks ready to start (all have unmet dependencies)${NC}"
else
  echo "Ready to start:"
  echo "$ready_tasks" | while read -r task; do
    desc=$(jq -r ".tasks[\"$task\"].description" "$YD_MEMORY/tasks/tasks.json")
    echo -e "  • ${BOLD}$task${NC}: $desc"
  done
fi

echo ""
