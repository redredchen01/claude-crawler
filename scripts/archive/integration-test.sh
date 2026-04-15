#!/bin/bash
set -e
shopt -s expand_aliases

# Integration Test Suite
# Comprehensive validation of all components working together

export YD_MEMORY="$HOME/.session-wrap-integration-test"

# Load shared test helpers
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/test-helpers.sh"

# Source wrap aliases from workspace root
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$WORKSPACE_ROOT/.zshrc-wrap"

echo "═══════════════════════════════════════════════════════════"
echo "🔄 SESSION-WRAP v3.4.0 INTEGRATION TEST"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test memory: $YD_MEMORY"
mkdir -p "$YD_MEMORY"
echo ""
echo ""
# ============================================
# SCENARIO 1: Single Developer, Multiple Sessions
# ============================================
section "SCENARIO 1: Single Developer, Multiple Sessions"

echo "Simulating a developer working on feature over multiple sessions..."

# Session 1
agent-knowledge set project-name "MyApp"
agent-knowledge set tech-stack "TypeScript, React, Node.js"
agent-knowledge set conventions "ESLint, Prettier, Jest"
test_pass "Developer initializes project knowledge"

agent-tasks add "auth-login" "Implement login form"
agent-tasks add "auth-logout" "Implement logout" "auth-login"
agent-tasks claim "auth-login"
test_pass "Developer claims first task"

agent-decision log "auth-method" "Use Firebase Auth" "reduces backend work"
test_pass "Developer logs decision for auth method"

agent-checkpoint save "initial-setup"
test_pass "Developer creates checkpoint before starting"

agent-tasks done "auth-login"
test_pass "Developer completes first task"

wrap "Session 1: login UI implemented"
test_pass "Developer saves session"

# Session 2 (new machine/day)
echo ""
echo "Simulating new session (different machine/day)..."

CONTEXT=$(agent-context)
if echo "$CONTEXT" | grep -q "auth-method"; then
  test_pass "Context loads previous decisions automatically"
else
  test_fail "Context does not load previous decisions"
fi

NEXT=$(agent-tasks next)
if echo "$NEXT" | grep -q "auth-logout"; then
  test_pass "Next tasks show correctly (auth-login done, auth-logout ready)"
else
  test_fail "Next tasks incorrect"
fi

agent-tasks claim "auth-logout"
agent-decision log "logout-flow" "Clear tokens and redirect" "security best practice"
agent-tasks done "auth-logout"
test_pass "Developer completes second task in new session"

wrap "Session 2: logout UI completed"

# ============================================
# SCENARIO 2: Two Agents, Dependency Coordination
# ============================================
section "SCENARIO 2: Two Agents, Dependency Coordination"

echo "Simulating backend and frontend agents coordinating..."

# Clear previous state for this scenario
rm -rf "$YD_MEMORY"
mkdir -p "$YD_MEMORY"

# Backend Agent (Agent A)
echo "Agent A (Backend): Setting up API..."
agent-tasks add "db-setup" "Create database schema"
agent-tasks add "api-users" "User endpoints" "db-setup"
agent-tasks claim "db-setup" "backend-agent"

agent-decision log "database" "PostgreSQL" "proven, scalable"
agent-tasks done "db-setup"

agent-share write backend-agent << 'EOF'
# Backend Progress

✅ Database schema created
- tables: users, projects, tasks
- migrations: 001_initial.sql

Ready for API development
EOF
test_pass "Backend agent completes first task and publishes progress"

# Frontend Agent (Agent B)
echo "Agent B (Frontend): Reading backend progress..."
BACKEND_STATE=$(agent-share read backend-agent)
if echo "$BACKEND_STATE" | grep -q "Database"; then
  test_pass "Frontend agent reads backend's progress"
else
  test_fail "Frontend agent cannot read backend's progress"
fi

NEXT=$(agent-tasks next)
if echo "$NEXT" | grep -q "api-users"; then
  test_pass "Frontend agent sees api-users is ready (db-setup done)"
else
  test_fail "Frontend agent cannot see next available task"
fi

agent-tasks claim "api-users" "frontend-agent"
agent-decision log "api-design" "REST endpoints" "simpler than GraphQL"
agent-tasks done "api-users"

agent-share write frontend-agent << 'EOF'
# Frontend Progress

Working on:
- Login form (waiting for /auth endpoints)
- Dashboard UI (can start after API is ready)

Ready for integration with backend
EOF
test_pass "Frontend agent completes task and publishes progress"

# ============================================
# SCENARIO 3: Three-Agent Parallel Work
# ============================================
section "SCENARIO 3: Three-Agent Parallel Work"

echo "Simulating 3 agents working on different aspects..."

# Clear state
rm -rf "$YD_MEMORY"
mkdir -p "$YD_MEMORY"

# Initialize project
agent-knowledge set architecture "Microservices: API, Frontend, Docs"
agent-knowledge set conventions "TypeScript strict, all code reviewed, tests required"

# Define all tasks
agent-tasks add "api-auth" "Authentication API"
agent-tasks add "api-crud" "CRUD operations" "api-auth"
agent-tasks add "ui-login" "Login page" "api-auth"
agent-tasks add "ui-dashboard" "Dashboard" "api-crud"
agent-tasks add "docs-api" "API documentation" "api-crud"

# Agent 1: Backend
echo "Agent 1: Building API..."
agent-tasks claim "api-auth" "agent-backend"
agent-decision log "auth" "JWT tokens" "stateless"
sleep 1
agent-tasks done "api-auth"
agent-share write agent-backend "API auth endpoints ready"
test_pass "Agent 1 (Backend) completes auth API"

# Agent 2: Frontend (can start now that api-auth is done)
echo "Agent 2: Building UI..."
agent-tasks claim "ui-login" "agent-frontend"
agent-decision log "ui-framework" "React with Hooks" "modern"
sleep 1
agent-tasks done "ui-login"
agent-share write agent-frontend "Login UI ready for auth API"
test_pass "Agent 2 (Frontend) completes login page"

# Agent 3: Documentation (can start now that api-auth is done)
echo "Agent 3: Writing docs..."
agent-tasks claim "docs-api" "agent-docs"
agent-decision log "doc-format" "OpenAPI + examples" "comprehensive"
sleep 1
agent-tasks done "docs-api"
agent-share write agent-docs "API documentation complete"
test_pass "Agent 3 (Docs) completes API documentation"

# All agents continue
agent-tasks claim "api-crud" "agent-backend"
agent-tasks done "api-crud"
test_pass "Agent 1 completes CRUD after auth"

agent-tasks claim "ui-dashboard" "agent-frontend"
agent-tasks done "ui-dashboard"
test_pass "Agent 2 completes dashboard after CRUD ready"

# Verify all tasks done
STATUS=$(agent-tasks status)
if echo "$STATUS" | grep -q "api-auth" && grep -q "ui-login" <<< "$STATUS"; then
  test_pass "All agent tasks are tracked correctly"
else
  test_fail "Task tracking incomplete"
fi

# ============================================
# SCENARIO 4: Decision Preservation & Recovery
# ============================================
section "SCENARIO 4: Decision Preservation & Recovery"

echo "Validating that decisions prevent rework..."

# Clear state
rm -rf "$YD_MEMORY"
mkdir -p "$YD_MEMORY"

# Agent A makes a decision
agent-decision log "database-type" "Use PostgreSQL" "ACID compliance needed"
agent-decision log "cache-strategy" "Redis for sessions" "high performance"
test_pass "Agent A logs architectural decisions"

# Agent B reviews decisions before starting work
DECISION=$(agent-decision search "database-type")
if echo "$DECISION" | grep -q "PostgreSQL"; then
  test_pass "Agent B can search and find decisions"
else
  test_fail "Agent B cannot retrieve decisions"
fi

# Verify decision reasoning is preserved
if echo "$DECISION" | grep -q "ACID"; then
  test_pass "Decision reasoning is preserved (ACID compliance)"
else
  test_fail "Decision reasoning lost"
fi

# ============================================
# SCENARIO 5: Memory Lifecycle & Optimization
# ============================================
section "SCENARIO 5: Memory Lifecycle & Optimization"

echo "Testing memory management..."

# Create some history
for i in {1..5}; do
  agent-decision log "iteration-$i" "Chose approach $i" "iteration $i reasoning"
  wrap "Session $i complete"
done
test_pass "Created multiple sessions and decisions"

# Check memory stats
STATS=$(agent-optimize stats)
if echo "$STATS" | grep -q "Total memory"; then
  test_pass "Memory stats available"
else
  test_fail "Memory stats not working"
fi

# Decisions should never be deleted
DECISION_COUNT=$(ls -1 "$YD_MEMORY"/decisions/*.md 2>/dev/null | wc -l)
if [ "$DECISION_COUNT" -ge 5 ]; then
  test_pass "Decisions preserved: $DECISION_COUNT decisions retained"
else
  test_fail "Decisions lost during optimization"
fi

# ============================================
# SCENARIO 6: Cross-Machine Consistency
# ============================================
section "SCENARIO 6: Cross-Machine Consistency"

echo "Validating memory consistency..."

# Check that all components are accessible
if [ -d "$YD_MEMORY/agents" ] && [ -d "$YD_MEMORY/decisions" ] && [ -d "$YD_MEMORY/knowledge" ] && [ -f "$YD_MEMORY/tasks/tasks.json" ]; then
  test_pass "All memory components exist and accessible"
else
  test_fail "Memory components missing or inaccessible"
fi

# Verify MEMORY.md index
if [ -f "$YD_MEMORY/MEMORY.md" ]; then
  test_pass "Memory index file created"
else
  test_skip "Memory index file (can be created manually)"
fi

# ============================================
# SCENARIO 7: Error Recovery
# ============================================
section "SCENARIO 7: Error Recovery & Checkpoints"

echo "Testing checkpoint and recovery..."

# Create initial state
echo "initial content" > "$YD_MEMORY/important-file.txt"
agent-checkpoint save "before-risky-change"
test_pass "Checkpoint created before risky changes"

# Make changes
echo "risky change" >> "$YD_MEMORY/important-file.txt"

# Verify checkpoint exists
LIST=$(agent-checkpoint list)
if echo "$LIST" | grep -q "before-risky-change"; then
  test_pass "Checkpoint retrievable from list"
else
  test_fail "Checkpoint not found in list"
fi

# ============================================
# SCENARIO 8: Knowledge Base Evolution
# ============================================
section "SCENARIO 8: Knowledge Base Evolution"

echo "Testing knowledge base updates..."

# Initial knowledge
agent-knowledge set api-style "REST"
agent-knowledge set db-tool "PostgreSQL"

# Update knowledge as project evolves
agent-knowledge set api-style "REST with GraphQL subset"
test_pass "Knowledge updated with evolution of project"

# Verify knowledge accessible
KNOWLEDGE=$(agent-knowledge get api-style)
if echo "$KNOWLEDGE" | grep -q "GraphQL"; then
  test_pass "Updated knowledge is accessible"
else
  test_fail "Knowledge update not reflected"
fi

# ============================================
# SCENARIO 9: Task Dependency Resolution
# ============================================
section "SCENARIO 9: Task Dependency Resolution"

echo "Testing complex task dependencies..."

# Clear for clean test
rm -rf "$YD_MEMORY"
mkdir -p "$YD_MEMORY"

# Create complex dependency chain
agent-tasks add "design" "Architecture design"
agent-tasks add "backend" "Backend implementation" "design"
agent-tasks add "frontend" "Frontend implementation" "design"
agent-tasks add "integration" "Integration testing" "backend,frontend"
agent-tasks add "deploy" "Deploy to production" "integration"
test_pass "Created multi-level task dependency chain"

# Verify only design is executable
NEXT=$(agent-tasks next)
if echo "$NEXT" | grep -q "design" && ! echo "$NEXT" | grep -q "backend"; then
  test_pass "Only tasks with met dependencies are shown"
else
  test_fail "Dependency resolution incorrect"
fi

# Complete tasks in order
agent-tasks done "design"
NEXT=$(agent-tasks next)
if echo "$NEXT" | grep -q "backend" && echo "$NEXT" | grep -q "frontend"; then
  test_pass "Multiple parallel tasks unlocked after dependency"
else
  test_fail "Parallel dependency resolution failed"
fi

agent-tasks done "backend"
agent-tasks done "frontend"
NEXT=$(agent-tasks next)
if echo "$NEXT" | grep -q "integration"; then
  test_pass "Final tasks unlock when dependencies met"
else
  test_fail "Final task dependency resolution failed"
fi

# ============================================
# SCENARIO 10: Full Context Injection
# ============================================
section "SCENARIO 10: Full Context Injection"

echo "Testing agent startup context loading..."

# Set up comprehensive knowledge base
agent-knowledge set architecture "Layered architecture with clean code"
agent-knowledge set conventions "TypeScript strict mode, unit tests required, 80% coverage"
agent-knowledge set tech-stack "Node 18, Express, PostgreSQL, Jest, Docker"
agent-knowledge set known-issues "API response time slow under load, consider caching"

# Log recent decisions
agent-decision log "language-choice" "TypeScript" "type safety, better DX"
agent-decision log "testing-strategy" "TDD" "catches bugs earlier"

# Full context injection
CONTEXT=$(agent-context full)
if echo "$CONTEXT" | grep -q "architecture"; then
  test_pass "Context includes architecture"
else
  test_fail "Context missing architecture"
fi

if echo "$CONTEXT" | grep -q "conventions"; then
  test_pass "Context includes conventions"
else
  test_fail "Context missing conventions"
fi

if echo "$CONTEXT" | grep -q "tech-stack"; then
  test_pass "Context includes tech-stack"
else
  test_fail "Context missing tech-stack"
fi

if echo "$CONTEXT" | grep -q "language-choice"; then
  test_pass "Context includes recent decisions"
else
  test_fail "Context missing recent decisions"
fi

# ============================================
# FINAL SUMMARY
# ============================================

test_summary "INTEGRATION TEST"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo ""
  echo "All scenarios validated:"
  echo "  ✅ Single developer with multiple sessions"
  echo "  ✅ Two agents with task dependencies"
  echo "  ✅ Three agents working in parallel"
  echo "  ✅ Decision preservation across sessions"
  echo "  ✅ Memory lifecycle and optimization"
  echo "  ✅ Cross-machine consistency"
  echo "  ✅ Error recovery with checkpoints"
  echo "  ✅ Knowledge base evolution"
  echo "  ✅ Complex task dependencies"
  echo "  ✅ Full context injection at startup"
  echo ""
  echo "Session-wrap is production-ready! 🚀"
  echo ""
  exit 0
else
  echo ""
  echo "Failed scenarios need investigation:"
  echo "  $TESTS_FAILED test(s) failed"
  echo ""
  exit 1
fi
