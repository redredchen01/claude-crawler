#!/bin/bash

# Project Timeline
# Visualizes project progress over time with velocity metrics

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

# Header
echo ""
echo -e "${BOLD}${BLUE}⏱️  PROJECT TIMELINE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if sessions exist
SESSION_COUNT=$(ls -1 "$YD_MEMORY/session_"*.md 2>/dev/null | wc -l)

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No sessions recorded yet${NC}"
  echo "Sessions are automatically recorded when you run: wrap"
  echo ""
  exit 0
fi

echo -e "${CYAN}📊 Project Duration${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Get first and last session dates
FIRST_SESSION=$(ls -1t "$YD_MEMORY/session_"*.md | tail -1)
LAST_SESSION=$(ls -1t "$YD_MEMORY/session_"*.md | head -1)

if [ ! -z "$FIRST_SESSION" ] && [ ! -z "$LAST_SESSION" ]; then
  first_date=$(echo "$FIRST_SESSION" | grep -oE 'session_[0-9]{8}' | sed 's/session_//')
  last_date=$(echo "$LAST_SESSION" | grep -oE 'session_[0-9]{8}' | sed 's/session_//')

  # Format dates
  first_formatted=$(echo "$first_date" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3/')
  last_formatted=$(echo "$last_date" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3/')

  echo -e "  Start Date:   ${BOLD}$first_formatted${NC}"
  echo -e "  Last Session: ${BOLD}$last_formatted${NC}"
  echo ""
fi

# Session timeline
echo -e "${CYAN}📅 Session History${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

ls -1t "$YD_MEMORY/session_"*.md | nl | while read -r num file; do
  session_date=$(echo "$file" | grep -oE 'session_[0-9]{8}' | sed 's/session_//')
  date_formatted=$(echo "$session_date" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3/')

  # Get file size (indicates work done)
  filesize=$(du -h "$file" 2>/dev/null | cut -f1)

  # Try to extract summary from file
  summary=$(head -20 "$file" | grep -E "^(Completed|Implemented|Fixed|Added|Updated)" | head -1)

  if [ ! -z "$summary" ]; then
    echo -e "  ${CYAN}$num.${NC} ${BOLD}[$date_formatted]${NC} ${GRAY}($filesize)${NC}"
    echo -e "     └─ $summary"
  else
    echo -e "  ${CYAN}$num.${NC} ${BOLD}[$date_formatted]${NC} ${GRAY}($filesize)${NC}"
  fi
done

echo ""

# Velocity analysis
echo -e "${CYAN}⚡ Work Velocity${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Count tasks completed per day
echo "Tasks completed:"

if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  total_tasks=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  done_tasks=$(jq '[.tasks[] | select(.status == "done")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  pending_tasks=$(jq '[.tasks[] | select(.status != "done")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)

  echo -e "  ${GREEN}✅ Done${NC}:     $done_tasks / $total_tasks"
  echo -e "  ${YELLOW}⭐ Pending${NC}: $pending_tasks / $total_tasks"
  echo ""

  # Estimate completion
  if [ "$done_tasks" -gt 0 ] && [ "$SESSION_COUNT" -gt 0 ]; then
    tasks_per_session=$(( done_tasks / SESSION_COUNT ))
    remaining_sessions=$(( pending_tasks / (tasks_per_session + 1) ))

    echo "Velocity:"
    echo -e "  • Average: ${BOLD}$tasks_per_session tasks/session${NC}"
    echo -e "  • Est. completion: ${BOLD}$remaining_sessions more sessions${NC} (if trend continues)"
  fi
fi

echo ""

# Decision frequency
echo -e "${CYAN}💡 Decision Frequency${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

if [ -d "$YD_MEMORY/decisions" ]; then
  decision_count=$(ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null | wc -l)

  if [ "$decision_count" -gt 0 ] && [ "$SESSION_COUNT" -gt 0 ]; then
    decisions_per_session=$(( decision_count / SESSION_COUNT ))
    echo -e "  Total Decisions: ${BOLD}$decision_count${NC}"
    echo -e "  Per Session:     ${BOLD}$decisions_per_session${NC} decisions/session"
    echo ""

    echo "Recent decisions:"
    ls -1t "$YD_MEMORY/decisions"/*.md 2>/dev/null | head -5 | while read -r file; do
      filename=$(basename "$file")
      topic=$(echo "$filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//' | sed 's/\.md$//')

      echo -e "  • ${YELLOW}$topic${NC}"
    done
  fi
fi

echo ""

# Progress visualization
echo -e "${CYAN}📈 Progress Over Time${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Simple ASCII chart of sessions
echo "Session Activity (last 10 sessions):"
ls -1t "$YD_MEMORY/session_"*.md | head -10 | tac | while read -r file; do
  session_date=$(echo "$file" | grep -oE 'session_[0-9]{8}' | sed 's/session_//')
  date_short=$(echo "$session_date" | sed 's/^\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)$/\2-\3/')

  # Get file size as activity indicator
  filesize_kb=$(du -k "$file" 2>/dev/null | cut -f1)

  # Create bar based on size
  bar=""
  for ((i=0; i<filesize_kb; i+=2)); do
    bar="${bar}▮"
    if [ ${#bar} -gt 20 ]; then
      break
    fi
  done

  echo -e "  $date_short: $bar ${filesize_kb}KB"
done

echo ""

# Key metrics
echo -e "${CYAN}📊 Key Metrics${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Average session size
total_size=$(du -sb "$YD_MEMORY/session_"*.md 2>/dev/null | awk '{sum+=$1} END {print sum}')
avg_session=$(( total_size / SESSION_COUNT / 1024 ))

echo -e "  Sessions:        ${BOLD}$SESSION_COUNT${NC}"
echo -e "  Avg/Session:     ${BOLD}${avg_session}KB${NC}"

# Memory efficiency
total_memory=$(du -sb "$YD_MEMORY" 2>/dev/null | cut -f1)
total_memory_kb=$(( total_memory / 1024 ))

echo -e "  Total Memory:    ${BOLD}${total_memory_kb}KB${NC}"
echo -e "  Memory/Session:  ${BOLD}$(( total_memory_kb / SESSION_COUNT ))KB${NC}"

echo ""

# Agents
if [ -d "$YD_MEMORY/agents" ]; then
  agent_count=$(ls -1 "$YD_MEMORY/agents"/*.md 2>/dev/null | wc -l)
  if [ "$agent_count" -gt 0 ]; then
    echo -e "  Agents Active:   ${BOLD}$agent_count${NC}"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Recommendations
echo -e "${CYAN}💭 Insights${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

if [ "$SESSION_COUNT" -lt 3 ]; then
  echo "  • You're just getting started! Keep session-wrap running."
else
  echo "  • You have $SESSION_COUNT sessions recorded"
  echo "  • Run visualize-tasks to see task progress"
  echo "  • Run analyze-decisions to review architectural choices"
fi

if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  done_tasks=$(jq '[.tasks[] | select(.status == "done")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  total_tasks=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)

  if [ "$total_tasks" -gt 0 ]; then
    progress=$(( done_tasks * 100 / total_tasks ))
    echo "  • Project progress: $progress% ($done_tasks/$total_tasks tasks)"
  fi
fi

echo ""
