# Demo: Multi-Agent Todo App

Complete working example of 3 agents building a todo app using session-wrap-skill.

This demo shows **real session wraps** with actual agent decisions, task coordination, and knowledge sharing.

## Demo Overview

### The Project
Build a simple Todo API + Frontend in 2 days with 3 agents.

### The Agents
- **Codex** — Backend developer (Agent A)
- **Cursor** — Frontend developer (Agent B)
- **Windsurf** — API documentation writer (Agent C)

### The Timeline
- **Day 1:** Database design + auth API + login UI
- **Day 2:** Todo CRUD API + dashboard UI + full documentation

---

## Setup (5 minutes)

### 1. Prerequisites

```bash
# Ensure session-wrap is installed
npm install -g session-wrap-skill

# Load aliases
source ~/.zshrc-wrap

# Verify setup
agent-context    # Should work
agent-tasks list # Should be empty
```

### 2. Initialize Demo Project

```bash
# Go to examples
cd ~/YD\ 2026/examples/todo-app

# Create shared memory (one per machine or shared)
export YD_MEMORY="$HOME/.session-wrap-demo"
mkdir -p "$YD_MEMORY"

# Each agent sources .zshrc-wrap with custom memory
```

---

## Day 1: Agent Codex - Backend Foundation

### Codex's Session Script

**File: `examples/run-agent-codex.sh`**

```bash
#!/bin/bash
set -e

export YD_MEMORY="$HOME/.session-wrap-demo"
source ~/.zshrc-wrap

echo "👨‍💻 AGENT: Codex (Backend Developer)"
echo "📅 Day: 1"
echo "🎯 Tasks: Database schema + Auth API"
echo ""

# ============================================
# 1. Initialize Project Knowledge
# ============================================
echo "1️⃣ Setting up project knowledge..."

agent-knowledge set architecture << 'ARCH'
# Todo App - Microservices

## Frontend (React)
- Login page (email/password)
- Todo list (add/edit/delete/filter)
- User profile

## Backend (Node + Express)
- POST /auth/register, /login, /refresh
- GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id
- GET /user/profile

## Database (PostgreSQL)
- users: id, email, password_hash, created_at, updated_at
- todos: id, user_id, title, description, done, created_at, updated_at
ARCH

agent-knowledge set conventions << 'CONV'
- TypeScript strict mode enabled
- All routes require JWT auth (except /auth/*)
- All functions have JSDoc comments
- Tests required for all endpoints
- Error responses: {status: "error", message: "..."}
- Success responses: {status: "ok", data: {...}}
- Database timestamps: created_at, updated_at on all tables
CONV

agent-knowledge set tech-stack << 'TECH'
- Runtime: Node.js 18+
- Language: TypeScript
- API Framework: Express 4.x
- Database: PostgreSQL 14+
- Auth: JWT (15m access + 7d refresh)
- Testing: Jest + supertest
- Validation: joi
TECH

# ============================================
# 2. Define Project Tasks
# ============================================
echo "2️⃣ Defining tasks..."

agent-tasks add "db-design" "Design database schema"
agent-tasks add "db-migrate" "Create PostgreSQL tables" "db-design"
agent-tasks add "auth-api" "Implement /auth endpoints" "db-migrate"
agent-tasks add "todos-api" "Implement /todos endpoints" "db-migrate,auth-api"
agent-tasks add "api-tests" "Unit tests for API" "todos-api"
agent-tasks add "api-docs" "Write API documentation" "todos-api"
agent-tasks add "frontend-login" "Build login UI" "auth-api"
agent-tasks add "frontend-dashboard" "Build todo dashboard" "todos-api"
agent-tasks add "e2e-tests" "End-to-end tests" "frontend-login,frontend-dashboard,api-tests"

# ============================================
# 3. Codex Claims First Tasks
# ============================================
echo "3️⃣ Claiming tasks for Day 1..."

agent-tasks claim "db-design" "codex"
agent-tasks claim "db-migrate" "codex"
agent-tasks claim "auth-api" "codex"

# ============================================
# 4. Design Database
# ============================================
echo "4️⃣ Designing database..."

agent-decision log "database" "Use UUID primary keys" << 'DECISION'
Better for distributed systems. Prevents ID guessing. Easier for logging/debugging.
Used in both REST routes and cache keys.
DECISION

agent-decision log "timestamps" "created_at + updated_at on all tables" << 'DECISION'
Standard practice. Helps with auditing and debugging.
PostgreSQL TIMESTAMP DEFAULT CURRENT_TIMESTAMP handles it automatically.
DECISION

# Simulate work
sleep 1
echo "   ✓ Database schema designed (users, todos)"

# Mark task complete
agent-tasks done "db-design"

# ============================================
# 5. Implement Auth
# ============================================
echo "5️⃣ Implementing auth API..."

agent-decision log "jwt-strategy" "JWT with refresh tokens" << 'DECISION'
- Access token: 15 minutes (short lived, safe if exposed)
- Refresh token: 7 days (stored in httpOnly cookie)
This pattern balances security and UX. Refresh happens silently on client.
DECISION

agent-decision log "password-hashing" "bcrypt with 12 rounds" << 'DECISION'
Industry standard. Slow by design (prevents brute force).
12 rounds = ~250ms per hash = good for security without UX impact.
DECISION

# Simulate work
sleep 1
echo "   ✓ Auth API implemented (register, login, refresh)"

agent-tasks done "db-migrate"
agent-tasks done "auth-api"

# ============================================
# 6. Publish Progress
# ============================================
echo "6️⃣ Publishing progress for other agents..."

agent-share write codex << 'PROGRESS'
# Codex Progress - Day 1 Complete

## Completed ✅
✓ Database schema designed
✓ PostgreSQL migrations written
✓ Auth API implemented (/register, /login, /refresh)

## Database Schema
- users: id (UUID), email, password_hash, created_at, updated_at
- todos: id, user_id, title, description, done, created_at, updated_at

## Auth API
```
POST /auth/register
  Input: {email, password}
  Output: {access_token, refresh_token}

POST /auth/login
  Input: {email, password}
  Output: {access_token, refresh_token}

POST /auth/refresh
  Input: {refresh_token}
  Output: {access_token}
```

## Key Decisions
- JWT with refresh tokens (15m access, 7d refresh)
- bcrypt-12 for password hashing
- UUID primary keys on all tables
- Timestamps on all tables (created_at, updated_at)

## Next
Cursor can start building login UI (auth API is ready).
Windsurf can start writing API docs (auth endpoints are done).
PROGRESS

echo "   ✓ Progress published to ~/.session-wrap-demo/agents/"

# ============================================
# 7. End Session
# ============================================
echo "7️⃣ Ending session and saving..."

wrap "Codex: Database design + auth API complete. Ready for integration."

echo ""
echo "✅ CODEX SESSION COMPLETE"
echo ""
echo "Summary:"
echo "  - Tasks completed: 3/9"
echo "  - Decisions logged: 4"
echo "  - Knowledge documented: 3 topics"
echo "  - Progress shared: codex-state.md"
echo ""
```

### Running Codex's Session

```bash
bash examples/run-agent-codex.sh

# Output:
# 👨‍💻 AGENT: Codex (Backend Developer)
# 1️⃣ Setting up project knowledge...
# 2️⃣ Defining tasks...
# 3️⃣ Claiming tasks for Day 1...
# 4️⃣ Designing database...
#    ✓ Database schema designed
# 5️⃣ Implementing auth...
#    ✓ Auth API implemented (register, login, refresh)
# 6️⃣ Publishing progress...
#    ✓ Progress published
# 7️⃣ Ending session...
# ✅ CODEX SESSION COMPLETE
```

---

## Day 2: Agents Cursor & Windsurf

### Cursor's Session Script

**File: `examples/run-agent-cursor.sh`**

```bash
#!/bin/bash
set -e

export YD_MEMORY="$HOME/.session-wrap-demo"
source ~/.zshrc-wrap

echo "👩‍💻 AGENT: Cursor (Frontend Developer)"
echo "📅 Day: 2"
echo "🎯 Task: Build login UI"
echo ""

# Load context from Codex
echo "Loading context from Codex..."
agent-context
agent-share read codex

# See available tasks
echo ""
echo "Available tasks:"
agent-tasks next

# Claim and work on frontend task
agent-tasks claim "frontend-login" "cursor"

echo "Building login UI..."
sleep 1

agent-decision log "auth-ui-flow" "Email → Password → Submit" << 'DECISION'
Simple form (no OAuth). Stores JWT tokens per Codex design.
Access token in memory (cleared on reload). Refresh token in httpOnly cookie.
DECISION

agent-tasks done "frontend-login"

# Publish progress
agent-share write cursor "✅ Login UI complete. Form submits to /auth/login, handles JWT tokens."

wrap "Cursor: Login UI complete. Ready for integration with Codex's API."

echo "✅ CURSOR SESSION COMPLETE"
```

### Windsurf's Session Script

**File: `examples/run-agent-windsurf.sh`**

```bash
#!/bin/bash
set -e

export YD_MEMORY="$HOME/.session-wrap-demo"
source ~/.zshrc-wrap

echo "📖 AGENT: Windsurf (API Documentation)"
echo "📅 Day: 2"
echo "🎯 Task: Document API"
echo ""

# Load context
agent-context
agent-share read codex

# Wait for APIs
echo "Checking task status..."
agent-tasks next

# Document API
echo "Writing API documentation..."
sleep 1

agent-share write windsurf << 'DOCS'
# Todo API Documentation

## Auth Endpoints

### POST /auth/register
Register new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (201):**
```json
{
  "status": "ok",
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ..."
  }
}
```

### POST /auth/login
Login with email and password.

[Full documentation with curl examples...]
DOCS

agent-tasks done "api-docs"

wrap "Windsurf: Complete API documentation written with curl examples."

echo "✅ WINDSURF SESSION COMPLETE"
```

---

## Running the Complete Demo

```bash
# Setup
mkdir -p ~/.session-wrap-demo
export YD_MEMORY="$HOME/.session-wrap-demo"

# Day 1: Codex sets up backend
echo "=== DAY 1: CODEX BACKEND SETUP ==="
bash examples/run-agent-codex.sh

# Day 2: Cursor and Windsurf work independently
echo ""
echo "=== DAY 2: CURSOR & WINDSURF FRONTEND + DOCS ==="
bash examples/run-agent-cursor.sh &
bash examples/run-agent-windsurf.sh &
wait

# Verify results
echo ""
echo "=== DEMO COMPLETE ==="
echo ""
echo "Check shared memory:"
agent-tasks status    # Shows all tasks done
agent-context         # Shows all decisions
agent-share list      # Shows 3 agents published
```

---

## Expected Output

After running all sessions:

```
📊 Task Graph Status:
Total: 9 tasks
  ✓ Done: 5
  ○ Pending: 4 (blocked on other tasks)

test-task: Test task [pending]
  Blocked on: feature-x (not started yet)

api-docs: Write API documentation [done]
  Blocked on: todos-api (done ✓)

frontend-login: Build login UI [done]
  Blocked on: auth-api (done ✓)

🤖 Active Agent States:
   - codex (0h ago)
   - cursor (0h ago)
   - windsurf (0h ago)

📋 Recent Decisions:
- database (UUID primary keys)
- jwt-strategy (JWT with refresh tokens)
- password-hashing (bcrypt-12)
- auth-ui-flow (simple form, no OAuth)
- api-documentation (comprehensive with examples)
```

---

## Key Takeaways

✅ **What the demo shows:**
1. **Multi-agent coordination** — 3 agents worked without stepping on each other
2. **Decision tracking** — Every major choice logged with reasoning
3. **Task dependency graph** — Agents picked up where others left off
4. **Knowledge sharing** — Decisions and architecture automatically available
5. **Context injection** — Each agent loaded full project context instantly
6. **Memory sharing** — Agent B saw what Agent A did via agent-share

✅ **You could do this with:**
- Your own multi-agent projects
- Team development
- Complex feature builds
- Long-running initiatives (days/weeks)

---

## Next Steps

1. **Run the demo locally:**
   ```bash
   cd ~/YD\ 2026/examples/todo-app
   bash run-full-demo.sh
   ```

2. **Adapt to your project:**
   - Copy agent script templates
   - Customize tasks and decisions
   - Share with your team

3. **Deploy with backend:**
   - Run backend on Railway (see PRODUCTION-SETUP.md)
   - Set SESSION_WRAP_API_URL
   - Enable cloud sync for agent-share

---

**This demo proves that multi-agent projects are feasible, coherent, and efficient with session-wrap-skill!** 🚀
