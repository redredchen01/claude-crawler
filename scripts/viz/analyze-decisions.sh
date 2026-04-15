#!/bin/bash

# Analyze Decisions
# Generates statistics and insights from project decisions

export YD_MEMORY="${YD_MEMORY:-$HOME/.claude/projects/-Users-dex-YD-2026/memory}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m'

# Check if decisions exist
if [ ! -d "$YD_MEMORY/decisions" ] || [ -z "$(ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null)" ]; then
  echo -e "${YELLOW}⚠️  No decisions recorded yet.${NC}"
  echo "Log your first decision with: agent-decision log \"topic\" \"decision\" \"reasoning\""
  exit 0
fi

DECISION_COUNT=$(ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null | wc -l)

# Header
echo ""
echo -e "${BOLD}${BLUE}🧠 DECISION ANALYSIS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Overall stats
echo -e "${CYAN}📊 Statistics${NC}"
echo "───────────────────────────────────────────────────────────────"
echo -e "Total Decisions: ${BOLD}$DECISION_COUNT${NC}"
echo ""

# Extract topics and count
echo -e "${CYAN}📋 By Topic${NC}"
echo "───────────────────────────────────────────────────────────────"

declare -A topic_count
declare -a topics_array

for file in "$YD_MEMORY/decisions"/*.md; do
  if [ -f "$file" ]; then
    # Extract topic from filename (YYYY-MM-DD-topic.md)
    filename=$(basename "$file")
    topic=$(echo "$filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//' | sed 's/\.md$//')

    if [ -z "${topic_count[$topic]}" ]; then
      topic_count[$topic]=0
      topics_array+=("$topic")
    fi
    topic_count[$topic]=$((${topic_count[$topic]} + 1))
  fi
done

# Sort and display
for topic in $(printf '%s\n' "${topics_array[@]}" | sort); do
  count=${topic_count[$topic]}
  echo -e "  ${YELLOW}◆${NC} ${BOLD}$topic${NC}: $count decision(s)"
done

echo ""

# Recent decisions
echo -e "${CYAN}⏱️  Recent Decisions${NC}"
echo "───────────────────────────────────────────────────────────────"

ls -1t "$YD_MEMORY/decisions"/*.md 2>/dev/null | head -10 | while read -r file; do
  filename=$(basename "$file")

  # Parse filename
  date=$(echo "$filename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')
  topic=$(echo "$filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//' | sed 's/\.md$//')

  # Extract decision and reasoning from file
  decision=$(grep -A1 "^## Decision" "$file" | tail -1 | head -c 60)
  reasoning=$(grep -A1 "^## Reasoning" "$file" | tail -1 | head -c 80)

  echo -e "  ${GREEN}✓${NC} ${BOLD}[$date]${NC} ${YELLOW}$topic${NC}"
  if [ ! -z "$decision" ]; then
    echo -e "     Decision: $decision"
  fi
  if [ ! -z "$reasoning" ]; then
    echo -e "     Reason: $reasoning..."
  fi
  echo ""
done

echo ""

# Decision impact analysis
echo -e "${CYAN}💡 Decision Patterns${NC}"
echo "───────────────────────────────────────────────────────────────"

# Find most mentioned keywords in reasoning
echo "Common keywords in reasoning:"

grep -h "^## Reasoning" -A2 "$YD_MEMORY/decisions"/*.md 2>/dev/null | \
  grep -v "^--$" | \
  grep -v "^## Reasoning" | \
  tr ' ' '\n' | \
  tr '[:upper:]' '[:lower:]' | \
  sort | uniq -c | sort -rn | head -10 | while read -r count word; do

  # Skip common words
  case "$word" in
    the|a|an|and|or|is|to|for|in|of|with|that|this|be) continue ;;
  esac

  echo "  • ${BOLD}$word${NC}: mentioned $count times"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Decision trace - show decision journey
echo -e "${CYAN}🗺️  Decision Journey${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""

ls -1 "$YD_MEMORY/decisions"/*.md 2>/dev/null | sort | while read -r file; do
  filename=$(basename "$file")
  date=$(echo "$filename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')
  topic=$(echo "$filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//' | sed 's/\.md$//')

  decision=$(grep -A1 "^## Decision" "$file" | tail -1)

  echo -e "  ${GRAY}$date${NC} → ${YELLOW}$topic${NC}: ${BOLD}$decision${NC}"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Export option
echo -e "${CYAN}📤 Export Decisions${NC}"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Generate report with:"
echo "  agent-decision list | tee decision-report.txt"
echo ""
echo "Search for specific decisions:"
echo "  agent-decision search \"keyword\""
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
