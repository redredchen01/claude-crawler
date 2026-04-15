# Session-Wrap Examples

Real-world demonstrations of multi-agent coordination using session-wrap-skill v3.4.0.

## Quick Start

### Full Demo: 3-Agent Todo App

Run the complete demo with all agents working together:

```bash
cd ~/YD\ 2026
bash examples/run-full-demo.sh
```

This orchestrates:
1. **Day 1**: Codex (backend developer) designs database & auth API
2. **Day 2**: Cursor (frontend) builds login UI + Windsurf (docs) writes API docs in parallel

Takes ~10 seconds, demonstrates all 7 agent tools.

---

## Individual Agent Scripts

Run agents independently for testing or learning:

### Codex (Backend Developer)

```bash
export YD_MEMORY="$HOME/.session-wrap-demo"
bash examples/run-agent-codex.sh
```

**What happens:**
- Initializes project knowledge (architecture, conventions, tech-stack)
- Defines 9 tasks with dependencies
- Designs database schema
- Implements auth API endpoints
- Logs architectural decisions (JWT strategy, password hashing)
- Publishes progress via `agent-share`

**Demonstrates:**
- `agent-knowledge` — project knowledge base setup
- `agent-tasks` — task definition and dependency graph
- `agent-decision` — decision logging with reasoning
- `agent-share` — publishing agent state
- `wrap` — session auto-save

---

### Cursor (Frontend Developer)

```bash
export YD_MEMORY="$HOME/.session-wrap-demo"
bash examples/run-agent-cursor.sh
```

**What happens:**
- Loads project context via `agent-context`
- Reads Codex's progress via `agent-share read`
- Builds login UI component
- Documents design decisions
- Marks tasks complete

**Demonstrates:**
- `agent-context` — auto-inject project knowledge
- `agent-share read` — consume other agent's work
- `agent-tasks claim/done` — claim and complete tasks
- `agent-decision log` — log UI/UX decisions

---

### Windsurf (API Documentation)

```bash
export YD_MEMORY="$HOME/.session-wrap-demo"
bash examples/run-agent-windsurf.sh
```

**What happens:**
- Loads context from multiple agents
- Reads Codex's API design and Cursor's frontend flow
- Writes comprehensive API documentation with curl examples
- Documents authentication strategy

**Demonstrates:**
- `agent-share read` — read from multiple agents
- `agent-context` — see architecture, conventions, tech-stack
- Documentation generation based on agent work

---

## What Gets Created

After running the demo, inspect the shared memory:

```bash
# View shared agent states
ls $HOME/.session-wrap-demo/agents/
# → codex-state.md, cursor-state.md, windsurf-state.md

# View all decisions
ls $HOME/.session-wrap-demo/decisions/
# → YYYY-MM-DD-database.md, YYYY-MM-DD-jwt-strategy.md, etc.

# View knowledge base
ls $HOME/.session-wrap-demo/knowledge/
# → architecture.md, conventions.md, tech-stack.md, known-issues.md

# View task graph
cat $HOME/.session-wrap-demo/tasks/tasks.json
# → Shows all 9 tasks with dependencies and status

# View session wraps
ls $HOME/.session-wrap-demo/session_*.md
# → session_YYYYMMDD_wrap.md (one per agent)
```

---

## Environment Variables

```bash
# Custom memory directory (default: ~/.session-wrap-demo)
export YD_MEMORY="/path/to/custom/memory"

# Cloud sync URL (optional, for production deployment)
export SESSION_WRAP_API_URL="https://your-backend.railway.app"
```

---

## Key Behaviors to Notice

### 1. Context Injection
When Cursor runs, it loads architecture/conventions/tech-stack automatically via `agent-context`:

```
Project Context:
─────────────────
Architecture: Frontend (React), Backend (Node + Express), Database (PostgreSQL)
Conventions: TypeScript strict, JWT auth, JSDoc comments, tests required
Tech Stack: Node 18+, TypeScript, Express 4.x, PostgreSQL 14+, Jest
```

### 2. Task Dependencies
Tasks defined with dependencies prevent agents from starting work on blocked tasks:

```
✅ db-design (completed by Codex)
   ├─ ✅ db-migrate (completed by Codex)
   │  ├─ ⏳ auth-api (ready for Codex)
   │  └─ ⏳ todos-api (blocked on auth-api)
```

Cursor's `agent-tasks next` only shows tasks with completed dependencies.

### 3. Cross-Agent Memory Sharing
Cursor runs `agent-share read codex` and gets Codex's full progress:

```markdown
## Completed ✅
✓ Database schema designed
✓ PostgreSQL migrations written
✓ Auth API implemented (/register, /login, /refresh)

## Key Decisions
- JWT: 15m access + 7d refresh tokens
- Password: bcrypt-12
- Validation: joi library
```

Windsurf reads BOTH agents' states before writing documentation.

### 4. Decision Logging
Decisions are logged with reasoning, preventing "why?" questions later:

```markdown
## Decision: JWT with refresh tokens
**Reasoning:**
- Access token: 15 minutes (short lived, safe if exposed)
- Refresh token: 7 days (stored in httpOnly cookie)
- This pattern balances security and UX. Refresh happens silently on client.
```

Agents can search decisions: `agent-decision search "jwt"`

### 5. Memory Organization
All session data organized by type:

```
$YD_MEMORY/
├── agents/           # Agent states (cross-agent sharing)
├── decisions/        # Decision logs with reasoning
├── knowledge/        # Project knowledge base
├── tasks/            # Task dependency graph
├── checkpoints/      # Git-backed checkpoints
├── session_*.md      # Session wraps (one per agent)
└── MEMORY.md         # Index
```

---

## Run Your Own Demo

Customize the scripts for your project:

```bash
# 1. Edit run-agent-codex.sh
#    - Change knowledge (architecture, conventions)
#    - Define your project's tasks
#    - Add your own decisions

# 2. Copy run-agent-cursor.sh and adapt
#    - Change to your agent's role
#    - Update what they build/write/document

# 3. Run the orchestration script
bash examples/run-full-demo.sh
```

---

## Testing Individual Features

### Test agent-context
```bash
export YD_MEMORY="$HOME/.session-wrap-demo"
source ~/.zshrc-wrap
agent-context
# Should show: Recent decisions, conventions, tasks, etc.
```

### Test agent-tasks
```bash
agent-tasks add "test-task" "Test description"
agent-tasks next          # Should show executable tasks
agent-tasks claim "test-task" "test-agent"
agent-tasks done "test-task"
agent-tasks status        # Should show task as complete
```

### Test agent-decision
```bash
agent-decision log "test" "test decision" "test reasoning"
agent-decision list
agent-decision search "test"
```

### Test agent-share
```bash
agent-share write test-agent "Some progress here"
agent-share read test-agent
agent-share list
```

### Test agent-knowledge
```bash
agent-knowledge set mykey "my value"
agent-knowledge get mykey
agent-knowledge list
```

### Test agent-optimize
```bash
agent-optimize stats      # Show memory breakdown
agent-optimize archive    # Keep last 3 sessions
agent-optimize prune      # Remove empty files
```

---

## Troubleshooting

### Scripts fail with "command not found"
```bash
# Make sure session-wrap-skill is installed
npm install -g session-wrap-skill

# And aliases are loaded
source ~/.zshrc-wrap
```

### Memory directory not found
```bash
# Create it first
export YD_MEMORY="$HOME/.session-wrap-demo"
mkdir -p "$YD_MEMORY"
```

### agent-tasks shows no next tasks
```bash
# All tasks might be completed or have unmet dependencies
agent-tasks status        # Show full graph
```

### agent-share read returns nothing
```bash
# The other agent hasn't published state yet, or it's stale
agent-share list          # Show all published states
agent-share clean         # Remove states older than 24h
```

---

## Documentation

- **[TODO-DEMO.md](TODO-DEMO.md)** — Detailed walkthrough of 3-agent demo
- **[../README.md](../README.md)** — v3.4.0 feature overview
- **[../QUICKSTART-EXAMPLES.md](../QUICKSTART-EXAMPLES.md)** — 3 copy-paste examples
- **[../AGENT-WORKFLOW.md](../AGENT-WORKFLOW.md)** — 6 workflow patterns
- **[../INTEGRATIONS.md](../INTEGRATIONS.md)** — Editor & platform setup

---

**Ready to see multi-agent coordination in action? Run `bash examples/run-full-demo.sh`!** 🚀
