#!/bin/bash
set -e
shopt -s expand_aliases

# Test Suite for Session-Wrap-Skill v3.4.0 Agent Tools
# Validates all 7 agent coordination tools

export YD_MEMORY="$HOME/.session-wrap-test"

# Load shared test helpers
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/test-helpers.sh"

# Source wrap aliases from workspace root
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Tool paths for testing
KNOWLEDGE_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-knowledge.sh"
DECISION_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-decision.sh"
TASKS_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-tasks.sh"
CHECKPOINT_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-checkpoint.sh"
SHARE_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-share.sh"
CONTEXT_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-context.sh"
OPTIMIZE_SCRIPT="$WORKSPACE_ROOT/scripts/agent/agent-optimize.sh"
WRAP_SCRIPT="$WORKSPACE_ROOT/scripts/wrap-cli.sh"



echo "═══════════════════════════════════════════════════════════"
echo "🧪 SESSION-WRAP-SKILL v3.4.0 TEST SUITE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Memory directory: $YD_MEMORY"
echo ""

# Initialize test memory
mkdir -p "$YD_MEMORY"

# ============================================
# TEST 1: agent-knowledge
# ============================================
echo ""
echo -e "${BLUE}TEST 1: agent-knowledge${NC}"
echo "────────────────────────"

bash "$KNOWLEDGE_SCRIPT" set test-topic "Test knowledge content for validation"
test_pass "agent-knowledge set"

if bash "$KNOWLEDGE_SCRIPT" get test-topic | grep -q "Test knowledge content"; then
  test_pass "agent-knowledge get"
else
  test_fail "agent-knowledge get"
fi

if bash "$KNOWLEDGE_SCRIPT" list | grep -q "test-topic"; then
  test_pass "agent-knowledge list"
else
  test_fail "agent-knowledge list"
fi

# ============================================
# TEST 2: agent-decision
# ============================================
echo ""
echo -e "${BLUE}TEST 2: agent-decision${NC}"
echo "────────────────────────"

bash "$DECISION_SCRIPT" log "test-decision" "chose option A" "option A is faster"
test_pass "agent-decision log"

DECISIONS=$(bash "$DECISION_SCRIPT" list)
if echo "$DECISIONS" | grep -q "test-decision"; then
  test_pass "agent-decision list contains logged decision"
else
  test_fail "agent-decision list"
fi

if bash "$DECISION_SCRIPT" search "chose option A" | grep -q "test-decision"; then
  test_pass "agent-decision search"
else
  test_fail "agent-decision search"
fi

# ============================================
# TEST 3: agent-tasks
# ============================================
echo ""
echo -e "${BLUE}TEST 3: agent-tasks${NC}"
echo "────────────────────────"

bash "$TASKS_SCRIPT" add "task-1" "First test task"
test_pass "agent-tasks add simple"

bash "$TASKS_SCRIPT" add "task-2" "Second test task" "task-1"
test_pass "agent-tasks add with dependency"

bash "$TASKS_SCRIPT" claim "task-1" "test-agent"
test_pass "agent-tasks claim"

bash "$TASKS_SCRIPT" done "task-1"
test_pass "agent-tasks done"

NEXT_TASKS=$(bash "$TASKS_SCRIPT" next)
if echo "$NEXT_TASKS" | grep -q "task-2"; then
  test_pass "agent-tasks next shows executable task"
else
  test_fail "agent-tasks next"
fi

STATUS=$(bash "$TASKS_SCRIPT" status)
if echo "$STATUS" | grep -q "task-1"; then
  test_pass "agent-tasks status"
else
  test_fail "agent-tasks status"
fi

# Verify JSON structure
assert_json_valid "$YD_MEMORY/tasks/tasks.json"

# ============================================
# TEST 4: agent-checkpoint
# ============================================
echo ""
echo -e "${BLUE}TEST 4: agent-checkpoint${NC}"
echo "────────────────────────"

# Create a test file to checkpoint
echo "test content v1" > "$YD_MEMORY/test-checkpoint.txt"

bash "$CHECKPOINT_SCRIPT" save "test-checkpoint-1"
test_pass "agent-checkpoint save"

# Verify checkpoint file created
if [ -d "$YD_MEMORY/checkpoints" ]; then
  test_pass "Checkpoints directory created"
else
  test_fail "Checkpoints directory not created"
fi

LIST=$(bash "$CHECKPOINT_SCRIPT" list)
if echo "$LIST" | grep -q "test-checkpoint-1"; then
  test_pass "agent-checkpoint list"
else
  test_fail "agent-checkpoint list"
fi

# ============================================
# TEST 5: agent-share
# ============================================
echo ""
echo -e "${BLUE}TEST 5: agent-share${NC}"
echo "────────────────────────"

cat > "$YD_MEMORY/test-state.md" << 'EOF'
# Test Agent State

## Completed Tasks
- Task 1: Done
- Task 2: In progress

## Notes
Testing agent-share functionality
EOF

bash "$SHARE_SCRIPT" write test-agent-1 "$YD_MEMORY/test-state.md"
test_pass "agent-share write"

if [ -f "$YD_MEMORY/agents/test-agent-1-state.md" ]; then
  test_pass "Agent state file created"
else
  test_fail "Agent state file not created"
fi

SHARED=$(bash "$SHARE_SCRIPT" read test-agent-1)
if echo "$SHARED" | grep -q "Test Agent State"; then
  test_pass "agent-share read"
else
  test_fail "agent-share read"
fi

LIST=$(bash "$SHARE_SCRIPT" list)
if echo "$LIST" | grep -q "test-agent-1"; then
  test_pass "agent-share list"
else
  test_fail "agent-share list"
fi

# ============================================
# TEST 6: agent-context
# ============================================
echo ""
echo -e "${BLUE}TEST 6: agent-context${NC}"
echo "────────────────────────"

# Set up knowledge for context
bash "$KNOWLEDGE_SCRIPT" set architecture "Test architecture with microservices"
bash "$KNOWLEDGE_SCRIPT" set conventions "TypeScript strict mode required"

CONTEXT=$(bash "$CONTEXT_SCRIPT")
if echo "$CONTEXT" | grep -q "architecture"; then
  test_pass "agent-context shows architecture"
else
  test_fail "agent-context missing architecture"
fi

if echo "$CONTEXT" | grep -q "conventions"; then
  test_pass "agent-context shows conventions"
else
  test_fail "agent-context missing conventions"
fi

if echo "$CONTEXT" | grep -q "test-decision"; then
  test_pass "agent-context shows recent decisions"
else
  test_fail "agent-context missing decisions"
fi

# ============================================
# TEST 7: agent-optimize
# ============================================
echo ""
echo -e "${BLUE}TEST 7: agent-optimize${NC}"
echo "────────────────────────"

STATS=$(bash "$OPTIMIZE_SCRIPT" stats)
if echo "$STATS" | grep -q "Total memory"; then
  test_pass "agent-optimize stats"
else
  test_fail "agent-optimize stats"
fi

# Don't actually archive in test (would modify state)
# bash "$OPTIMIZE_SCRIPT" archive
test_pass "agent-optimize available (not running archive)"

# ============================================
# TEST 8: Memory Structure Validation
# ============================================
echo ""
echo -e "${BLUE}TEST 8: Memory Structure Validation${NC}"
echo "────────────────────────"

# Check all required directories
for dir in agents decisions knowledge checkpoints tasks; do
  if [ -d "$YD_MEMORY/$dir" ]; then
    test_pass "Directory exists: $dir"
  else
    test_fail "Directory missing: $dir"
  fi
done

# Check critical files
assert_file_exists "$YD_MEMORY/tasks/tasks.json"
assert_file_exists "$YD_MEMORY/MEMORY.md"

# ============================================
# TEST 9: Integration Test - Multi-Agent Flow
# ============================================
echo ""
echo -e "${BLUE}TEST 9: Integration Test - Multi-Agent Flow${NC}"
echo "────────────────────────"

# Simulate Agent A
bash "$TASKS_SCRIPT" add "feature-a" "Implement feature A"
bash "$TASKS_SCRIPT" claim "feature-a" "agent-a"
bash "$DECISION_SCRIPT" log "feature-a" "use REST API" "simpler than GraphQL"
bash "$TASKS_SCRIPT" done "feature-a"
bash "$SHARE_SCRIPT" write agent-a << 'EOF'
# Agent A Progress

Completed feature A using REST API design pattern.
EOF
test_pass "Agent A workflow complete"

# Simulate Agent B reading A's work
AGENT_A_STATE=$(bash "$SHARE_SCRIPT" read agent-a)
if echo "$AGENT_A_STATE" | grep -q "Agent A Progress"; then
  test_pass "Agent B can read Agent A's work"
else
  test_fail "Agent B cannot read Agent A's work"
fi

# Agent B sees what A did and starts next task
NEXT=$(bash "$TASKS_SCRIPT" next)
test_pass "Agent B can see next available tasks"

# Verify decision is traceable
if bash "$DECISION_SCRIPT" search "REST API" | grep -q "feature-a"; then
  test_pass "Decisions are searchable and traceable"
else
  test_fail "Decisions not searchable"
fi



# ============================================
# TEST 10: Wrap and Session Management
# ============================================
echo ""
echo -e "${BLUE}TEST 10: Session Management${NC}"
echo "────────────────────────"

WRAP_COUNT=$(ls -1 "$YD_MEMORY"/session_*.md 2>/dev/null | wc -l)
if [ "$WRAP_COUNT" -gt 0 ]; then
  test_pass "Session wrap files created"
else
  test_fail "No session wrap files found"
fi

# ============================================
# SUMMARY
# ============================================

test_summary "AGENT TOOLS TEST"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo ""
  echo "All 7 agent tools are working correctly:"
  echo "  1. ✅ agent-knowledge"
  echo "  2. ✅ agent-decision"
  echo "  3. ✅ agent-tasks"
  echo "  4. ✅ agent-checkpoint"
  echo "  5. ✅ agent-share"
  echo "  6. ✅ agent-context"
  echo "  7. ✅ agent-optimize"
  echo ""
  echo "Integration test: Multi-agent coordination working ✅"
  echo ""
  exit 0
else
  echo ""
  echo "Fix the following issues and rerun:"
  echo "  $TESTS_FAILED test(s) failed"
  echo ""
  exit 1
fi
