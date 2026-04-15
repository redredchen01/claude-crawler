#!/bin/bash
set -e

# Full Demo: 3 Agents Building a Todo App
# This orchestrates Codex (backend), Cursor (frontend), Windsurf (docs)

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-demo}"
mkdir -p "$YD_MEMORY"

echo "═══════════════════════════════════════════════════════════"
echo "🚀 SESSION-WRAP-SKILL v3.4.0 DEMO"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Building a Todo App with 3 Agents:"
echo "  • Codex (Backend Developer)"
echo "  • Cursor (Frontend Developer)"
echo "  • Windsurf (API Documentation)"
echo ""
echo "Memory location: $YD_MEMORY"
echo ""

# ============================================
# DAY 1: CODEX - BACKEND FOUNDATION
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📅 DAY 1: CODEX (BACKEND DEVELOPER)"
echo "═══════════════════════════════════════════════════════════"
echo ""

bash examples/run-agent-codex.sh

echo "Waiting before next agent..."
sleep 2

# ============================================
# DAY 2: CURSOR & WINDSURF (PARALLEL)
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📅 DAY 2: CURSOR & WINDSURF (FRONTEND + DOCUMENTATION)"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "Starting Cursor (Frontend) and Windsurf (Docs) in parallel..."
echo ""

# Run both agents in parallel
bash examples/run-agent-cursor.sh &
CURSOR_PID=$!

bash examples/run-agent-windsurf.sh &
WINDSURF_PID=$!

# Wait for both to complete
wait $CURSOR_PID
wait $WINDSURF_PID

# ============================================
# DEMO COMPLETE - SHOW RESULTS
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ DEMO COMPLETE!"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "📊 Task Status:"
agent-tasks status
echo ""

echo "📋 Recent Decisions:"
agent-decision list
echo ""

echo "🤖 Active Agents:"
agent-share list
echo ""

echo "📈 Memory Stats:"
agent-optimize stats
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "WHAT JUST HAPPENED:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ Day 1: Codex (Backend)"
echo "   • Designed database schema (users, todos)"
echo "   • Implemented auth API (/auth/register, /login, /refresh)"
echo "   • Logged 4 architectural decisions"
echo "   • Defined 9-task project with dependencies"
echo "   • Published progress via agent-share"
echo ""

echo "✅ Day 2: Cursor (Frontend) & Windsurf (Docs)"
echo "   • Cursor read Codex's progress and designed login UI"
echo "   • Windsurf read both agents' work and wrote complete API docs"
echo "   • Both agents worked in parallel without stepping on each other"
echo "   • All shared memory (decisions, knowledge, progress) was used"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "KEY FEATURES DEMONSTRATED:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1️⃣  agent-context: Auto-inject project context on startup"
echo "2️⃣  agent-share: Cross-agent memory (codex → cursor/windsurf)"
echo "3️⃣  agent-decision: Log architectural decisions with reasoning"
echo "4️⃣  agent-knowledge: Project knowledge base (auto-initialized)"
echo "5️⃣  agent-tasks: Task dependency graph (prevents conflicts)"
echo "6️⃣  agent-optimize: Memory management (archiving, cleanup)"
echo "7️⃣  wrap: Session auto-save with context injection"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "NEXT STEPS:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Explore shared memory:"
echo "   ls -la $YD_MEMORY/agents/"
echo "   ls -la $YD_MEMORY/decisions/"
echo "   ls -la $YD_MEMORY/knowledge/"
echo ""

echo "2. View task graph:"
echo "   agent-tasks status"
echo ""

echo "3. Check agent decisions:"
echo "   agent-decision list"
echo "   agent-decision search 'jwt'"
echo ""

echo "4. View memory breakdown:"
echo "   agent-optimize stats"
echo ""

echo "5. Archive and optimize:"
echo "   agent-optimize archive"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🎉 DEMO SUCCESSFULLY DEMONSTRATES MULTI-AGENT COORDINATION!"
echo ""
echo "For more info: cat examples/TODO-DEMO.md"
echo ""
