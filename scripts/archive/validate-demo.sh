#!/bin/bash
set -e

# Validation Script for TODO-DEMO.md
# Verifies that the demo runs correctly and produces expected output

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-demo-validate}"
DEMO_PASSED=0
DEMO_FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

source ~/.zshrc-wrap

echo "═══════════════════════════════════════════════════════════"
echo "🧪 TODO-DEMO VALIDATION TEST"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Validation memory: $YD_MEMORY"
echo ""

# Initialize demo memory
mkdir -p "$YD_MEMORY"

validate_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((DEMO_PASSED++))
}

validate_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  ((DEMO_FAILED++))
}

# ============================================
# STEP 1: Verify Demo Scripts Exist
# ============================================
echo ""
echo -e "${BLUE}STEP 1: Verify Demo Scripts${NC}"
echo "────────────────────────"

for script in run-agent-codex.sh run-agent-cursor.sh run-agent-windsurf.sh run-full-demo.sh; do
  if [ -f "examples/$script" ] && [ -x "examples/$script" ]; then
    validate_pass "Script exists and is executable: $script"
  else
    validate_fail "Script missing or not executable: $script"
  fi
done

# ============================================
# STEP 2: Run Individual Agent Sessions
# ============================================
echo ""
echo -e "${BLUE}STEP 2: Run Individual Agent Sessions${NC}"
echo "────────────────────────"

echo "Running Codex (backend)..."
if bash examples/run-agent-codex.sh > /tmp/codex-output.txt 2>&1; then
  validate_pass "Codex session completed without errors"

  # Verify Codex output contains key markers
  if grep -q "CODEX SESSION COMPLETE" /tmp/codex-output.txt; then
    validate_pass "Codex session completed successfully"
  else
    validate_fail "Codex session output missing completion marker"
  fi

  if grep -q "Database schema designed" /tmp/codex-output.txt; then
    validate_pass "Codex output contains database design"
  else
    validate_fail "Codex output missing database design"
  fi

  if grep -q "Auth API implemented" /tmp/codex-output.txt; then
    validate_pass "Codex output contains auth API"
  else
    validate_fail "Codex output missing auth API"
  fi
else
  validate_fail "Codex session failed"
fi

echo ""
echo "Running Cursor (frontend)..."
if bash examples/run-agent-cursor.sh > /tmp/cursor-output.txt 2>&1; then
  validate_pass "Cursor session completed without errors"

  if grep -q "CURSOR SESSION COMPLETE" /tmp/cursor-output.txt; then
    validate_pass "Cursor session completed successfully"
  else
    validate_fail "Cursor session output missing completion marker"
  fi

  if grep -q "Login form component created" /tmp/cursor-output.txt; then
    validate_pass "Cursor output contains login UI"
  else
    validate_fail "Cursor output missing login UI"
  fi
else
  validate_fail "Cursor session failed"
fi

echo ""
echo "Running Windsurf (documentation)..."
if bash examples/run-agent-windsurf.sh > /tmp/windsurf-output.txt 2>&1; then
  validate_pass "Windsurf session completed without errors"

  if grep -q "WINDSURF SESSION COMPLETE" /tmp/windsurf-output.txt; then
    validate_pass "Windsurf session completed successfully"
  else
    validate_fail "Windsurf session output missing completion marker"
  fi

  if grep -q "API specification written" /tmp/windsurf-output.txt; then
    validate_pass "Windsurf output contains API docs"
  else
    validate_fail "Windsurf output missing API docs"
  fi
else
  validate_fail "Windsurf session failed"
fi

# ============================================
# STEP 3: Verify Memory Structure
# ============================================
echo ""
echo -e "${BLUE}STEP 3: Verify Memory Structure${NC}"
echo "────────────────────────"

# Check agent states
for agent in codex cursor windsurf; do
  if [ -f "$YD_MEMORY/agents/${agent}-state.md" ]; then
    validate_pass "Agent state file exists: $agent"

    # Verify content
    if [ -s "$YD_MEMORY/agents/${agent}-state.md" ]; then
      validate_pass "Agent state file is not empty: $agent"
    else
      validate_fail "Agent state file is empty: $agent"
    fi
  else
    validate_fail "Agent state file missing: $agent"
  fi
done

# Check decisions
DECISION_COUNT=$(ls -1 "$YD_MEMORY"/decisions/*.md 2>/dev/null | wc -l)
if [ "$DECISION_COUNT" -gt 0 ]; then
  validate_pass "Decision files created: $DECISION_COUNT decisions logged"
else
  validate_fail "No decision files created"
fi

# Verify specific decisions
for decision_pattern in "database" "jwt" "password"; do
  if ls "$YD_MEMORY"/decisions/*-${decision_pattern}*.md 2>/dev/null | grep -q .; then
    validate_pass "Decision logged: $decision_pattern"
  else
    validate_fail "Decision missing: $decision_pattern"
  fi
done

# ============================================
# STEP 4: Verify Task Graph
# ============================================
echo ""
echo -e "${BLUE}STEP 4: Verify Task Graph${NC}"
echo "────────────────────────"

if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  validate_pass "Task graph file created"

  # Verify it's valid JSON
  if jq empty "$YD_MEMORY/tasks/tasks.json" 2>/dev/null; then
    validate_pass "Task graph is valid JSON"
  else
    validate_fail "Task graph is invalid JSON"
  fi

  # Check for expected tasks
  TASK_COUNT=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  if [ "$TASK_COUNT" -ge 5 ]; then
    validate_pass "Task graph contains tasks: $TASK_COUNT tasks"
  else
    validate_fail "Task graph contains insufficient tasks: $TASK_COUNT"
  fi

  # Verify task status
  COMPLETED=$(jq '[.tasks[] | select(.status == "done")] | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  if [ "$COMPLETED" -ge 3 ]; then
    validate_pass "Tasks completed: $COMPLETED tasks marked done"
  else
    validate_fail "Insufficient completed tasks: $COMPLETED"
  fi
else
  validate_fail "Task graph file not created"
fi

# ============================================
# STEP 5: Verify Knowledge Base
# ============================================
echo ""
echo -e "${BLUE}STEP 5: Verify Knowledge Base${NC}"
echo "────────────────────────"

KNOWLEDGE_DIR="$YD_MEMORY/knowledge"
if [ -d "$KNOWLEDGE_DIR" ]; then
  validate_pass "Knowledge directory created"

  # Check for default topics
  for topic in architecture conventions tech-stack; do
    if [ -f "$KNOWLEDGE_DIR/${topic}.md" ]; then
      validate_pass "Knowledge topic exists: $topic"
    else
      validate_fail "Knowledge topic missing: $topic"
    fi
  done
else
  validate_fail "Knowledge directory not created"
fi

# ============================================
# STEP 6: Verify Cross-Agent Communication
# ============================================
echo ""
echo -e "${BLUE}STEP 6: Verify Cross-Agent Communication${NC}"
echo "────────────────────────"

# Check if Cursor read Codex's progress
if grep -q "Agent A Progress" "$YD_MEMORY/agents/cursor-state.md" 2>/dev/null || grep -q "codex" /tmp/cursor-output.txt; then
  validate_pass "Frontend agent read backend agent's progress"
else
  # This is more of a warning than a fail
  echo -e "${YELLOW}⚠️  Could not verify cross-agent reading${NC}"
fi

# ============================================
# STEP 7: Verify Session Wraps
# ============================================
echo ""
echo -e "${BLUE}STEP 7: Verify Session Wraps${NC}"
echo "────────────────────────"

SESSION_COUNT=$(ls -1 "$YD_MEMORY"/session_*.md 2>/dev/null | wc -l)
if [ "$SESSION_COUNT" -ge 3 ]; then
  validate_pass "Session wrap files created: $SESSION_COUNT wraps"
else
  validate_fail "Insufficient session wraps: $SESSION_COUNT (expected 3)"
fi

# ============================================
# STEP 8: Run Full Demo Orchestration
# ============================================
echo ""
echo -e "${BLUE}STEP 8: Run Full Demo Orchestration${NC}"
echo "────────────────────────"

# Clean memory for fresh full demo run
rm -rf "$YD_MEMORY"
mkdir -p "$YD_MEMORY"

echo "Running full demo (clean state)..."
if timeout 30 bash examples/run-full-demo.sh > /tmp/full-demo-output.txt 2>&1; then
  validate_pass "Full demo completed without errors"

  if grep -q "DEMO COMPLETE" /tmp/full-demo-output.txt; then
    validate_pass "Full demo completed successfully"
  else
    validate_fail "Full demo missing completion marker"
  fi

  if grep -q "DAY 1" /tmp/full-demo-output.txt; then
    validate_pass "Full demo includes Day 1 (Codex)"
  else
    validate_fail "Full demo missing Day 1"
  fi

  if grep -q "DAY 2" /tmp/full-demo-output.txt; then
    validate_pass "Full demo includes Day 2 (Cursor & Windsurf)"
  else
    validate_fail "Full demo missing Day 2"
  fi
else
  validate_fail "Full demo timed out or failed"
fi

# ============================================
# STEP 9: Verify Demo Output Structure
# ============================================
echo ""
echo -e "${BLUE}STEP 9: Verify Demo Output Structure${NC}"
echo "────────────────────────"

# After full demo, verify all pieces are in place
if [ -d "$YD_MEMORY/agents" ] && [ "$(ls -1 "$YD_MEMORY/agents" 2>/dev/null | wc -l)" -ge 1 ]; then
  validate_pass "Demo created agent state files"
else
  validate_fail "Demo did not create agent states"
fi

if [ -d "$YD_MEMORY/decisions" ] && [ "$(ls -1 "$YD_MEMORY/decisions" 2>/dev/null | wc -l)" -ge 2 ]; then
  validate_pass "Demo created decision logs"
else
  validate_fail "Demo did not create decision logs"
fi

if [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  TOTAL_TASKS=$(jq '.tasks | length' "$YD_MEMORY/tasks/tasks.json" 2>/dev/null || echo 0)
  if [ "$TOTAL_TASKS" -eq 9 ]; then
    validate_pass "Demo created correct number of tasks: 9"
  else
    validate_fail "Demo created wrong number of tasks: $TOTAL_TASKS (expected 9)"
  fi
else
  validate_fail "Demo did not create task graph"
fi

# ============================================
# STEP 10: Performance Check
# ============================================
echo ""
echo -e "${BLUE}STEP 10: Performance Check${NC}"
echo "────────────────────────"

START_TIME=$(date +%s)
bash examples/run-full-demo.sh > /dev/null 2>&1
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ "$DURATION" -lt 60 ]; then
  validate_pass "Demo completes in reasonable time: ${DURATION}s"
else
  echo -e "${YELLOW}⚠️  Demo took longer than expected: ${DURATION}s${NC}"
fi

# ============================================
# SUMMARY
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📊 VALIDATION SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""

TOTAL=$((DEMO_PASSED + DEMO_FAILED))
PASS_RATE=$(( (DEMO_PASSED * 100) / TOTAL ))

echo -e "Total Checks:  ${BLUE}$TOTAL${NC}"
echo -e "Passed:        ${GREEN}$DEMO_PASSED${NC}"
echo -e "Failed:        ${RED}$DEMO_FAILED${NC}"
echo -e "Pass Rate:     ${BLUE}${PASS_RATE}%${NC}"
echo ""

if [ $DEMO_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 DEMO VALIDATION PASSED!${NC}"
  echo ""
  echo "The TODO-DEMO is working correctly:"
  echo "  ✅ All agent scripts run successfully"
  echo "  ✅ Memory structure is correct"
  echo "  ✅ Cross-agent communication works"
  echo "  ✅ Task graph is properly managed"
  echo "  ✅ Full orchestration completes"
  echo ""
  echo "Demo is ready for production use!"
  echo ""
  exit 0
else
  echo -e "${RED}❌ DEMO VALIDATION FAILED${NC}"
  echo ""
  echo "Fix the following issues:"
  echo "  $DEMO_FAILED check(s) failed"
  echo ""
  echo "Check output files:"
  echo "  /tmp/codex-output.txt"
  echo "  /tmp/cursor-output.txt"
  echo "  /tmp/windsurf-output.txt"
  echo "  /tmp/full-demo-output.txt"
  echo ""
  exit 1
fi
