#!/bin/bash

# Memory Report
# Visualizes memory usage and structure with detailed breakdown

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

# Helper to format size
format_size() {
  local bytes=$1
  if [ $bytes -lt 1024 ]; then
    echo "${bytes}B"
  elif [ $bytes -lt 1048576 ]; then
    echo "$(( bytes / 1024 ))KB"
  else
    echo "$(( bytes / 1048576 ))MB"
  fi
}

# Header
echo ""
echo -e "${BOLD}${BLUE}💾 MEMORY REPORT${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Memory Location: ${CYAN}$YD_MEMORY${NC}"
echo ""

# Check if memory exists
if [ ! -d "$YD_MEMORY" ]; then
  echo -e "${YELLOW}⚠️  Memory directory not found${NC}"
  echo "Initialize with: agent-context"
  exit 0
fi

# Total size
TOTAL_SIZE=$(du -sh "$YD_MEMORY" 2>/dev/null | cut -f1)
TOTAL_BYTES=$(du -sb "$YD_MEMORY" 2>/dev/null | cut -f1)

echo -e "${CYAN}📊 Total Memory Usage${NC}"
echo "───────────────────────────────────────────────────────────────"
echo -e "Total Size: ${BOLD}$TOTAL_SIZE${NC}"
echo ""

# Breakdown by category
echo -e "${CYAN}📁 Memory Breakdown by Category${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

declare -A category_size
declare -a categories

# Sessions
if [ -d "$YD_MEMORY" ]; then
  session_bytes=$(find "$YD_MEMORY" -maxdepth 1 -name "session_*.md" -exec du -b {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
  session_count=$(find "$YD_MEMORY" -maxdepth 1 -name "session_*.md" 2>/dev/null | wc -l)
  if [ ! -z "$session_bytes" ] && [ "$session_bytes" -gt 0 ]; then
    category_size["Sessions"]=$session_bytes
    categories+=("Sessions")
    echo -e "  ${GREEN}📝${NC} ${BOLD}Sessions${NC}: $(format_size $session_bytes) ($session_count files)"
  fi
fi

# Decisions
if [ -d "$YD_MEMORY/decisions" ]; then
  decision_bytes=$(du -sb "$YD_MEMORY/decisions" 2>/dev/null | cut -f1)
  decision_count=$(ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null | wc -l)
  if [ "$decision_bytes" -gt 0 ]; then
    category_size["Decisions"]=$decision_bytes
    categories+=("Decisions")
    echo -e "  ${YELLOW}🧠${NC} ${BOLD}Decisions${NC}: $(format_size $decision_bytes) ($decision_count entries)"
  fi
fi

# Knowledge
if [ -d "$YD_MEMORY/knowledge" ]; then
  knowledge_bytes=$(du -sb "$YD_MEMORY/knowledge" 2>/dev/null | cut -f1)
  knowledge_count=$(ls -1 "$YD_MEMORY/knowledge"/*.md 2>/dev/null | wc -l)
  if [ "$knowledge_bytes" -gt 0 ]; then
    category_size["Knowledge"]=$knowledge_bytes
    categories+=("Knowledge")
    echo -e "  ${BLUE}📚${NC} ${BOLD}Knowledge${NC}: $(format_size $knowledge_bytes) ($knowledge_count topics)"
  fi
fi

# Tasks
if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  task_bytes=$(du -b "$YD_MEMORY/tasks/tasks.json" 2>/dev/null | cut -f1)
  task_count=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  if [ "$task_bytes" -gt 0 ]; then
    category_size["Tasks"]=$task_bytes
    categories+=("Tasks")
    echo -e "  ${CYAN}✓${NC} ${BOLD}Tasks${NC}: $(format_size $task_bytes) ($task_count tasks)"
  fi
fi

# Agent States
if [ -d "$YD_MEMORY/agents" ]; then
  agent_bytes=$(du -sb "$YD_MEMORY/agents" 2>/dev/null | cut -f1)
  agent_count=$(ls -1 "$YD_MEMORY/agents"/*.md 2>/dev/null | wc -l)
  if [ "$agent_bytes" -gt 0 ]; then
    category_size["Agent States"]=$agent_bytes
    categories+=("Agent States")
    echo -e "  ${CYAN}🤖${NC} ${BOLD}Agent States${NC}: $(format_size $agent_bytes) ($agent_count agents)"
  fi
fi

# Checkpoints
if [ -d "$YD_MEMORY/checkpoints" ]; then
  checkpoint_bytes=$(du -sb "$YD_MEMORY/checkpoints" 2>/dev/null | cut -f1)
  checkpoint_count=$(ls -1 "$YD_MEMORY/checkpoints"/*.snapshot 2>/dev/null | wc -l)
  if [ "$checkpoint_bytes" -gt 0 ]; then
    category_size["Checkpoints"]=$checkpoint_bytes
    categories+=("Checkpoints")
    echo -e "  ${YELLOW}📌${NC} ${BOLD}Checkpoints${NC}: $(format_size $checkpoint_bytes) ($checkpoint_count snapshots)"
  fi
fi

# Archive
if [ -d "$YD_MEMORY/archive" ]; then
  archive_bytes=$(du -sb "$YD_MEMORY/archive" 2>/dev/null | cut -f1)
  if [ "$archive_bytes" -gt 0 ]; then
    category_size["Archive"]=$archive_bytes
    categories+=("Archive")
    echo -e "  ${GRAY}🗄️${NC} ${BOLD}Archive${NC}: $(format_size $archive_bytes) (compressed old data)"
  fi
fi

echo ""

# Pie chart
echo -e "${CYAN}📈 Memory Distribution${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

for category in "${categories[@]}"; do
  bytes=${category_size[$category]}
  percentage=$(( (bytes * 100) / TOTAL_BYTES ))

  # Create bar
  bar=""
  for ((i=0; i<percentage; i+=5)); do
    bar="${bar}█"
  done

  echo -e "  ${BOLD}$category${NC}: $bar ${percentage}%"
done

echo ""

# Detailed breakdown
echo -e "${CYAN}🔍 Detailed File Breakdown${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

find "$YD_MEMORY" -type f -name "*.md" -o -name "*.json" -o -name "*.snapshot" | sort | while read -r file; do
  # Skip if in archive or metadata
  case "$file" in
    *MEMORY.md|*manifest.json) continue ;;
  esac

  size=$(du -b "$file" 2>/dev/null | cut -f1)
  size_fmt=$(format_size $size)

  # Determine icon based on type
  if [[ "$file" == *"/decisions/"* ]]; then
    icon="🧠"
  elif [[ "$file" == *"/knowledge/"* ]]; then
    icon="📚"
  elif [[ "$file" == *"/agents/"* ]]; then
    icon="🤖"
  elif [[ "$file" == *"/checkpoints/"* ]]; then
    icon="📌"
  elif [[ "$file" == *"/tasks/"* ]]; then
    icon="✓"
  elif [[ "$file" == *"session_"* ]]; then
    icon="📝"
  else
    icon="📄"
  fi

  filename=$(basename "$file")
  echo -e "  $icon ${GRAY}$size_fmt${NC} $filename"
done

echo ""

# Recommendations
echo -e "${CYAN}💡 Memory Recommendations${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

# Check if memory is getting large
if [ "$TOTAL_BYTES" -gt 10485760 ]; then
  # > 10MB
  echo -e "  ${YELLOW}⚠️  Memory usage is high ($(format_size $TOTAL_BYTES))${NC}"
  echo "     Consider: agent-optimize archive"
  echo ""
fi

# Check number of sessions
session_count=$(find "$YD_MEMORY" -maxdepth 1 -name "session_*.md" 2>/dev/null | wc -l)
if [ "$session_count" -gt 20 ]; then
  echo -e "  ${YELLOW}⚠️  Many session files ($session_count)${NC}"
  echo "     Consider: agent-optimize summarize"
  echo ""
fi

# Check decisions
decision_count=$(ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null | wc -l)
if [ "$decision_count" -gt 0 ]; then
  echo -e "  ${GREEN}✅ Decisions preserved: $decision_count decisions${NC}"
  echo "     (Never deleted, always searchable)"
  echo ""
fi

# Check tasks
if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  task_count=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  if [ "$task_count" -gt 0 ]; then
    echo -e "  ${GREEN}✅ Task graph active: $task_count tasks tracked${NC}"
    echo ""
  fi
fi

# Available actions
echo "Available actions:"
echo "  • ${BOLD}agent-optimize stats${NC}     — detailed memory breakdown"
echo "  • ${BOLD}agent-optimize archive${NC}   — keep last 3 sessions"
echo "  • ${BOLD}agent-optimize prune${NC}     — remove empty files"
echo "  • ${BOLD}visualize-tasks${NC}          — show task graph"
echo "  • ${BOLD}analyze-decisions${NC}        — analyze decisions"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
