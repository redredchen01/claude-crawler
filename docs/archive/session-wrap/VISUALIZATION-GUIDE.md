# Session-Wrap v3.4.0 Visualization Tools

Beautiful, colorful analysis and visualization tools to understand your project at a glance.

---

## Overview

4 powerful tools for monitoring and analyzing your project:

| Tool | Purpose | Shows |
|------|---------|-------|
| `visualize-tasks` | Task dependency graph | Status, dependencies, ready tasks |
| `analyze-decisions` | Decision analysis | Patterns, trends, history |
| `memory-report` | Memory usage | Breakdown, recommendations |
| `timeline` | Project progress | Timeline, velocity, metrics |

---

## 1. visualize-tasks

**Visualize the task dependency graph with status.**

```bash
visualize-tasks
```

### Example Output

```
📊 TASK DEPENDENCY GRAPH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: ███████░░░░░░░░░░░░ 35% (3/9)

✅ Done:        3
⏳ In Progress: 1
⭐ Pending:    5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPLETED TASKS
───────────────────────────────────────────────────────────────
  ✅ db-design
     Design database schema
  ✅ db-migrate
     Create PostgreSQL tables
  ✅ auth-api
     Implement /auth endpoints

IN PROGRESS
───────────────────────────────────────────────────────────────
  ⏳ todos-api (assigned to: backend-agent)
     Implement /todos endpoints

PENDING TASKS
───────────────────────────────────────────────────────────────
  ⭐ frontend-login (ready to start)
     Build login UI
  ⭐ frontend-dashboard (blocked on: todos-api)
     Build todo dashboard
  ...

DEPENDENCY TREE
───────────────────────────────────────────────────────────────
  ✅ db-design
     ├─ ✅ db-migrate
     │  ├─ ✅ auth-api
     │  │  └─ ⭐ frontend-login
     │  └─ ⏳ todos-api
     │     └─ ⭐ frontend-dashboard
```

### What It Shows

✅ **Progress bar** — Visual completion percentage
✅ **Status breakdown** — Done, in progress, pending counts
✅ **Completed tasks** — What's finished
✅ **In progress** — Who's working on what
✅ **Pending tasks** — What's blocked vs. ready
✅ **Dependency tree** — Visual hierarchy of dependencies
✅ **Agent assignments** — Who's doing what
✅ **Next actions** — What's ready to start

### Use Cases

- **Daily standup**: "What's our current progress?"
- **Planning**: "What's ready for the next agent to start?"
- **Troubleshooting**: "Why is this task blocked?"
- **Monitoring**: "Is everyone making progress?"

---

## 2. analyze-decisions

**Analyze project decision patterns and trends.**

```bash
analyze-decisions
```

### Example Output

```
🧠 DECISION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Statistics
───────────────────────────────────────────────────────────────
Total Decisions: 7

📋 By Topic
───────────────────────────────────────────────────────────────
  ◆ database: 1 decision(s)
  ◆ jwt-strategy: 1 decision(s)
  ◆ password-hashing: 1 decision(s)
  ◆ auth-ui-flow: 1 decision(s)
  ◆ cache-strategy: 1 decision(s)
  ◆ documentation-format: 1 decision(s)

⏱️  Recent Decisions
───────────────────────────────────────────────────────────────
  ✓ [2026-03-26] database
     Decision: Use PostgreSQL
     Reason: ACID compliance, mature, proven...

  ✓ [2026-03-26] jwt-strategy
     Decision: JWT with refresh tokens
     Reason: 15m access + 7d refresh, good balance...

💡 Decision Patterns
───────────────────────────────────────────────────────────────
Common keywords in reasoning:
  • security: mentioned 4 times
  • performance: mentioned 3 times
  • scalability: mentioned 2 times
  • user: mentioned 3 times

🗺️  Decision Journey
───────────────────────────────────────────────────────────────
  2026-03-26 → database: Use PostgreSQL
  2026-03-26 → jwt-strategy: JWT with refresh tokens
  2026-03-26 → password-hashing: bcrypt-12
  2026-03-26 → cache-strategy: Redis for sessions
  ...

📤 Export Decisions
───────────────────────────────────────────────────────────────
Generate report with:
  agent-decision list | tee decision-report.txt

Search for specific decisions:
  agent-decision search "keyword"
```

### What It Shows

✅ **Total count** — How many decisions made
✅ **By topic** — Decision distribution by category
✅ **Recent decisions** — Latest choices with reasoning
✅ **Decision patterns** — Common themes and keywords
✅ **Decision journey** — Timeline of all decisions
✅ **Export options** — How to generate reports

### Use Cases

- **Onboarding**: "What were our key architectural decisions?"
- **Audit**: "Why did we choose this technology?"
- **Learning**: "What patterns have worked for us?"
- **Consistency**: "Are we making similar decisions across domains?"

---

## 3. memory-report

**Monitor memory usage and get optimization recommendations.**

```bash
memory-report
```

### Example Output

```
💾 MEMORY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Memory Location: /Users/dex/.claude/projects/-Users-dex-YD-2026/memory

📊 Total Memory Usage
───────────────────────────────────────────────────────────────
Total Size: 1.2MB

📁 Memory Breakdown by Category
───────────────────────────────────────────────────────────────
  📝 Sessions: 450KB (5 files)
  🧠 Decisions: 120KB (7 entries)
  📚 Knowledge: 45KB (4 topics)
  ✓ Tasks: 15KB (9 tasks)
  🤖 Agent States: 250KB (3 agents)
  📌 Checkpoints: 320KB (8 snapshots)

📈 Memory Distribution
───────────────────────────────────────────────────────────────
  Sessions:      ██████████████░░░░░░░░░░░░░░░░░░░░░░ 35%
  Agent States:  ██████████████░░░░░░░░░░░░░░░░░░░░░░ 20%
  Checkpoints:   █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 26%
  Decisions:     ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  9%
  Knowledge:     ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  3%
  Tasks:         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1%

🔍 Detailed File Breakdown
───────────────────────────────────────────────────────────────
  📝 450KB session_20260326_wrap.md
  📝 380KB session_20260325_wrap.md
  🤖 180KB agents/backend-agent-state.md
  📌 300KB checkpoints/20260326_135000.snapshot
  🧠 85KB decisions/2026-03-26-database.md
  📚 35KB knowledge/architecture.md
  ...

💡 Memory Recommendations
───────────────────────────────────────────────────────────────
  ✅ Decisions preserved: 7 decisions
     (Never deleted, always searchable)

  ✅ Task graph active: 9 tasks tracked

Available actions:
  • agent-optimize stats     — detailed memory breakdown
  • agent-optimize archive   — keep last 3 sessions
  • agent-optimize prune     — remove empty files
  • visualize-tasks          — show task graph
  • analyze-decisions        — analyze decisions
```

### What It Shows

✅ **Total usage** — How much memory used
✅ **Breakdown by category** — Sessions, decisions, knowledge, etc.
✅ **Distribution chart** — Visual pie chart
✅ **Detailed file list** — Every file and its size
✅ **Recommendations** — When to archive/prune
✅ **Available actions** — Commands to manage memory

### Use Cases

- **Performance**: "Is memory getting too large?"
- **Optimization**: "What should I archive?"
- **Monitoring**: "How much is each category using?"
- **Cleanup**: "Are there empty files to prune?"

---

## 4. timeline

**Track project progress and velocity over time.**

```bash
timeline
```

### Example Output

```
⏱️  PROJECT TIMELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Project Duration
───────────────────────────────────────────────────────────────
  Start Date:   2026-03-24
  Last Session: 2026-03-26

📅 Session History
───────────────────────────────────────────────────────────────
  1. [2026-03-26] (680KB)
     └─ Completed: API design + database migration

  2. [2026-03-26] (420KB)
     └─ Completed: Frontend login component

  3. [2026-03-25] (550KB)
     └─ Completed: Initial backend structure

⚡ Work Velocity
───────────────────────────────────────────────────────────────
Tasks completed:
  ✅ Done:     3 / 9
  ⭐ Pending: 6 / 9

Velocity:
  • Average: 1 tasks/session
  • Est. completion: 6 more sessions (if trend continues)

💡 Decision Frequency
───────────────────────────────────────────────────────────────
  Total Decisions: 7
  Per Session:     2.3 decisions/session

Recent decisions:
  • database
  • jwt-strategy
  • password-hashing

📈 Progress Over Time
───────────────────────────────────────────────────────────────
Session Activity (last 10 sessions):
  03-26: ▮▮▮▮▮▮▮▮▮▮ 680KB
  03-25: ▮▮▮▮▮ 420KB
  03-24: ▮▮▮▮▮▮ 550KB

📊 Key Metrics
───────────────────────────────────────────────────────────────
  Sessions:        3
  Avg/Session:     550KB
  Total Memory:    1.2MB
  Memory/Session:  400KB
  Agents Active:   2

💭 Insights
───────────────────────────────────────────────────────────────
  • You have 3 sessions recorded
  • Project progress: 33% (3/9 tasks)
  • Run visualize-tasks to see task progress
  • Run analyze-decisions to review architectural choices
```

### What It Shows

✅ **Project duration** — Start date and last session
✅ **Session history** — All sessions with dates and sizes
✅ **Work velocity** — Tasks per session, completion estimate
✅ **Decision frequency** — Decisions per session
✅ **Progress chart** — ASCII activity visualization
✅ **Key metrics** — Sessions, memory, agents
✅ **Insights** — Actionable recommendations

### Use Cases

- **Status reports**: "How far along are we?"
- **Planning**: "When will we finish at this velocity?"
- **Retrospectives**: "How much work did we do?"
- **Team sync**: "What's our productivity trend?"

---

## Running All Visualizations

```bash
# Run all 4 visualization tools
visualize-tasks && analyze-decisions && memory-report && timeline
```

## Integration with Agent Tools

The visualization tools work seamlessly with agent commands:

```bash
# Log a decision
agent-decision log "auth" "use OAuth 2.0" "industry standard"

# Then analyze it
analyze-decisions

# View tasks
agent-tasks status

# Then visualize
visualize-tasks

# Check memory
agent-optimize stats

# Then get detailed report
memory-report

# View timeline
timeline
```

## Aliases Quick Reference

```bash
# Core agent tools
agent-context          # Load project context
agent-tasks            # Manage task graph
agent-decision         # Log decisions
agent-knowledge        # Project knowledge
agent-share            # Cross-agent sharing

# Visualization tools (NEW)
visualize-tasks        # Task dependency graph
analyze-decisions      # Decision analysis
memory-report          # Memory breakdown
timeline               # Project timeline

# Session management
wrap                   # Save session
sync-kb                # Sync knowledge base
mem                    # Quick memory view
```

## Keyboard Shortcuts (zsh)

After running `source ~/.zshrc-wrap`:

```bash
Ctrl+A              # Go to beginning of line
Ctrl+E              # Go to end of line

# Custom shortcuts added
visualize-tasks     # Alt+T (if configured)
timeline            # Alt+L (if configured)
```

## Tips & Tricks

### 1. Running Before Morning Standup
```bash
visualize-tasks      # See what's done and what's blocked
analyze-decisions    # Remind team of decisions made
```

### 2. Performance Investigation
```bash
memory-report        # Check memory usage
agent-optimize stats # Detailed breakdown
```

### 3. Project Health Check
```bash
timeline             # Project progress
visualize-tasks      # Task status
analyze-decisions    # Consistency check
```

### 4. Onboarding New Team Members
```bash
agent-context        # Project context
analyze-decisions    # Why we chose what we chose
visualize-tasks      # What's currently happening
```

---

## Terminal Output Tips

### Color Interpretation

- 🟢 **Green** (`✅`) — Complete, ready, success
- 🔵 **Blue** (`ℹ️`) — Info, architecture, context
- 🟡 **Yellow** (`⚠️`) — In progress, pending, caution
- 🔴 **Red** (`❌`) — Error, blocked, problem
- 🔷 **Cyan** (`◆`) — Category, topic, section
- ⚫ **Gray** — Metadata, timestamps, secondary info

### Understanding Progress Bars

```bash
████████░░░░░░░░░░░░░░░░░░░░ 30%
# = Completed
░ = Remaining
```

### Reading Dependency Trees

```
✅ Parent Task
   ├─ ✅ Child (done)
   ├─ ⏳ Child (in progress)
   └─ ⭐ Child (ready to start)
      └─ ❌ Grandchild (blocked)
```

---

## Architecture

All tools are written in pure bash with zero external dependencies:
- No npm packages required
- No Python scripts
- Works on macOS, Linux, WSL
- All data from JSON/Markdown files
- Colorful ANSI output

---

## What's Next

The visualization tools unlock new capabilities:

1. **Run `visualize-tasks`** → See your project structure
2. **Run `analyze-decisions`** → Understand your choices
3. **Run `memory-report`** → Monitor efficiency
4. **Run `timeline`** → Track progress

Then use `agent-*` tools to continue your work, and the visualization tools will reflect your progress in real-time.

---

**Session-wrap now gives you complete visibility into your multi-agent projects!** ✨

