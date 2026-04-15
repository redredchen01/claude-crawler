# Quick Start Examples

Copy-paste ready examples to get started with session-wrap-skill in 5 minutes.

---

## Example 1: Single Developer, One Project

**Scenario:** You're building a feature. Each session, you want to resume with full context.

### Session 1 - Day 1

```bash
# Setup (one time)
npm install -g session-wrap-skill
source ~/.zshrc-wrap

# Start session
echo "Creating new feature: User authentication"

# Load context (empty on first run)
agent-context

# Define what you're working on
agent-knowledge set conventions "TypeScript, ESLint config, tests required"
agent-knowledge set architecture "Express API with JWT + PostgreSQL"
agent-knowledge set tech-stack "Node 18, TypeScript, PostgreSQL, Jest"

# Plan tasks
agent-tasks add "auth-login" "Implement POST /login endpoint"
agent-tasks add "auth-register" "Implement POST /register endpoint"
agent-tasks add "auth-refresh" "Implement token refresh" "auth-login"
agent-tasks add "auth-tests" "Write tests for auth" "auth-login,auth-register"

# Start working on first task
agent-tasks claim "auth-login"

# You code for 2 hours...
# Then make a key decision:
agent-decision log "auth-strategy" "Use JWT with refresh tokens" \
  "Better security than just access tokens. Allows token rotation."

# First task done
agent-tasks done "auth-login"

# End session - auto-saves everything
wrap "Completed: login endpoint with JWT generation"
```

### Session 2 - Day 2 (Next week, new machine)

```bash
# Start session
source ~/.zshrc-wrap

# Load everything from yesterday
agent-context
# → Prints:
#   - Recent decision: "JWT with refresh tokens"
#   - Conventions: TypeScript, ESLint, tests required
#   - Known issues: (none yet)
#   - Next tasks: auth-register (after auth-login ✓)

# See what you were doing
agent-tasks next
# → Output:
#   □ auth-register: Implement POST /register endpoint

# Check why you chose JWT
agent-decision search "auth-strategy"
# → Shows: "Use JWT with refresh tokens" because "security + rotation"

# Continue where you left off
agent-tasks claim "auth-register"

# You code for 2 hours...
agent-decision log "password-hashing" "Use bcrypt with 12 rounds" \
  "Standard recommendation, built into most libs"

agent-tasks done "auth-register"

# End session
wrap "Completed: register endpoint with password hashing"
```

### Session 3 - Day 3

```bash
source ~/.zshrc-wrap
agent-context
agent-tasks next        # Shows: auth-refresh (ready to start)

# Continue without any context loss...
```

**Result:** 3 sessions, total 6 hours of work, zero context loss, all decisions logged.

---

## Example 2: Two-Agent Collaboration

**Scenario:** Backend developer (Agent A) and frontend developer (Agent B) work on same API.

### Agent A - Backend Dev (Monday)

```bash
#!/bin/bash
source ~/.zshrc-wrap

echo "👨‍💻 Agent A: Backend dev - setting up API"

# Initialize project
agent-knowledge set architecture \
  "REST API (Node + Express)
   Database: PostgreSQL
   Auth: JWT tokens
   Cache: Redis for user sessions"

agent-knowledge set conventions \
  "- TypeScript strict mode
   - All routes must have auth
   - Validate input with joi
   - Return status + data + error in JSON"

agent-knowledge set tech-stack \
  "Node 18, Express 4.x, PostgreSQL 14, Redis 7.x"

# Define tasks
agent-tasks add "api-db" "Create DB schema"
agent-tasks add "api-auth" "POST /auth/login, /register" "api-db"
agent-tasks add "api-users" "GET/PUT /users/:id" "api-db,api-auth"
agent-tasks add "api-items" "CRUD /items (main feature)" "api-db,api-auth"

# Claim and work on first task
agent-tasks claim "api-db" "agent-a"

# ... 4 hours of work ...

# Document the design
agent-decision log "database" \
  "Use UUID primary keys + timestamps on all tables" \
  "Better for distributed systems, makes debugging easier"

agent-decision log "auth-flow" \
  "JWT access token (15m) + refresh token (7d)" \
  "Balance between security and UX"

# Done with database
agent-tasks done "api-db"

# Publish progress for Agent B
agent-share write agent-a << 'EOF'
# Backend Progress - Day 1

## Completed
✅ Database schema
- users: id, email, password_hash, created_at
- items: id, user_id, title, description, created_at
- All tables have UUID + timestamps

## Decisions
- JWT: 15m access + 7d refresh tokens
- Password: bcrypt-12
- Validation: joi library

## Next
Agent B can start frontend once auth API is done:
- POST /auth/register
- POST /auth/login
- Returns: {access_token, refresh_token}

## DB Schema
See: src/db/schema.sql
EOF

wrap "Backend: Database design complete"
```

### Agent B - Frontend Dev (Tuesday)

```bash
#!/bin/bash
source ~/.zshrc-wrap

echo "👩‍💻 Agent B: Frontend dev - building UI"

# Load context from Agent A
agent-context
# → Prints architecture, conventions, tech stack

# See what backend developer did
agent-share read agent-a
# → Output shows: DB complete, JWT strategy decided

# Check available tasks
agent-tasks next
# → Output:
#   □ api-auth: (backend) - api-db is ✓ done, can start
#   □ api-users: (backend) - blocked on api-db, api-auth
#   □ api-items: (backend) - blocked on api-db, api-auth

# Claim frontend tasks
agent-tasks add "ui-login" "Build login form" "api-auth"
agent-tasks add "ui-dashboard" "Build dashboard" "api-items"
agent-tasks add "ui-tests" "E2E tests" "ui-login,ui-dashboard"

agent-tasks claim "ui-login" "agent-b"

# ... 4 hours of work building React login ...

# Document decisions
agent-decision log "auth-storage" \
  "Store refresh token in httpOnly cookie, access token in memory" \
  "Better security: prevents XSS from stealing refresh token"

agent-tasks done "ui-login"

# Publish progress
agent-share write agent-b << 'EOF'
# Frontend Progress - Day 1

## Completed
✅ Login UI (React)
- Email/password form
- Error handling
- Loading states

## Decisions
- Refresh token in httpOnly cookie (server-only, XSS safe)
- Access token in memory (cleared on page reload = auto logout)
- Auto-refresh when token expires (silent, no UX interruption)

## Next
Agent A needs to know:
- Login returns {access_token, refresh_token}
- Frontend will call GET /refresh when token expires
- Ready to build dashboard once items API is done
EOF

wrap "Frontend: Login form with JWT auth"
```

### Agent A - Backend (Back to work)

```bash
source ~/.zshrc-wrap

# See what frontend dev needs
agent-share read agent-b
# → Shows: frontend needs /auth/login returning tokens

agent-context
agent-tasks next  # Shows: api-auth is next

# Work on what frontend needs
agent-tasks claim "api-auth" "agent-a"

# ... implements /auth/login and /register ...

# Document auth API for frontend
agent-decision log "token-format" \
  "JWT payload: {user_id, email, iat, exp}" \
  "Minimal payload, enough for frontend to check expiry"

agent-tasks done "api-auth"
agent-share write agent-a "Auth API ready at POST /auth/*"

wrap "Backend: Auth API complete, frontend can integrate"
```

### Agent B - Ready to continue

```bash
source ~/.zshrc-wrap

# Check what's ready
agent-share list
# Shows: agent-a published progress

agent-share read agent-a
# → "Auth API ready at POST /auth/*"

agent-tasks next
# Shows: api-items is done ✓, can start ui-dashboard

agent-tasks claim "ui-dashboard" "agent-b"

# ... builds dashboard using backend APIs that are ready ...
```

**Result:** 2 agents, 2 days, zero stepping on each other, clear handoff points.

---

## Example 3: Three-Agent Team (Full Example)

**Scenario:** Building a todo app: Backend, API Documentation, Frontend

### Team Setup

```bash
# Agent 0: Architect sets up shared knowledge
source ~/.zshrc-wrap

agent-knowledge set architecture << 'EOF'
# Todo App Architecture

## Frontend → Backend → Database

Frontend (React):
- Login page
- Todo list with add/edit/delete
- Filter by status

API (Node + Express):
- POST /auth/register, /login
- GET /todos, POST /todos
- PUT /todos/:id, DELETE /todos/:id

Database (PostgreSQL):
- users: id, email, password_hash
- todos: id, user_id, title, done, created_at
EOF

agent-knowledge set conventions << 'EOF'
- TypeScript strict
- All functions need JSDoc
- All routes need unit tests
- Error messages: {status: "error", message: "..."}
- Success responses: {status: "ok", data: {...}}
EOF

# Define all tasks
agent-tasks add "db" "PostgreSQL schema"
agent-tasks add "auth" "Auth endpoints" "db"
agent-tasks add "api" "Todo CRUD endpoints" "db,auth"
agent-tasks add "docs" "API documentation" "api"
agent-tasks add "ui" "React UI" "api"
agent-tasks add "tests" "Unit + E2E tests" "api,ui"

wrap "Architecture and tasks defined"
```

### Agent Codex - Backend

```bash
source ~/.zshrc-wrap
echo "🔧 Codex: Building backend"

agent-context                # See architecture
agent-tasks claim "db" "codex"
agent-tasks claim "auth" "codex"

# ... builds database schema + auth endpoints ...

agent-decision log "token-expiry" "15 min access, 7 day refresh" \
  "Security vs convenience. Users refresh daily, API scales."

agent-tasks done "db"
agent-tasks done "auth"

agent-share write codex << 'EOF'
DB schema and auth ready.
Endpoints: POST /auth/register, POST /auth/login
Response: {access_token, refresh_token}
EOF

wrap "Database + auth API complete"
```

### Agent Cursor - API Docs

```bash
source ~/.zshrc-wrap
echo "📖 Cursor: Writing docs"

agent-context                          # See conventions
agent-share read codex                 # See what backend does

# Wait for API endpoints to be ready
agent-tasks claim "docs" "cursor"

# Once backend has api-auth done:
agent-tasks next
# → api is done ✓, can write docs

# ... writes complete API documentation with examples ...

agent-tasks done "docs"

agent-share write cursor << 'EOF'
API documentation complete.
All endpoints documented with curl examples.
EOF

wrap "API documentation finished"
```

### Agent Windsurf - Frontend

```bash
source ~/.zshrc-wrap
echo "🎨 Windsurf: Building UI"

agent-context
agent-share read codex                 # Backend API
agent-share read cursor                # Docs

agent-tasks claim "ui" "windsurf"

# ... builds React components ...

# Once API is ready, integrate
agent-tasks next
# → api is done ✓, auth is done ✓, can integrate

# ... completes UI integration ...

agent-tasks done "ui"

wrap "Frontend UI complete and integrated"
```

### Final Push

```bash
# Codex: Run backend tests
agent-tasks claim "tests" "codex"
# ... write and run backend tests ...
agent-tasks done "tests"

# Windsurf: E2E testing
agent-tasks claim "tests" "windsurf"  # Same task, both contribute
# ... write E2E tests, verify frontend+backend integration ...
agent-tasks done "tests"

# All done
agent-tasks status
# → All tasks done ✓
```

**Result:** 3-agent team, 2-3 days, full todo app with zero coordination overhead.

---

## Copy-Paste: Your First Session

Ready to try right now?

```bash
# 1. Install
npm install -g session-wrap-skill

# 2. Initialize
mkdir -p ~/.session-wrap
source ~/.zshrc-wrap

# 3. Your first session
agent-context              # Empty on first run
echo "Starting my first agent workflow!"

# 4. Set up project knowledge
agent-knowledge set conventions "Use TypeScript, ESLint, Jest"
agent-knowledge set architecture "Simple Express API + React frontend"

# 5. Define first task
agent-tasks add "hello-world" "Build hello endpoint"
agent-tasks claim "hello-world"

# 6. Log a decision
agent-decision log "hello" "Build GET /hello endpoint" \
  "Simple test endpoint to verify API works"

# 7. Simulate some work
sleep 2
echo "Code written and tested!"

# 8. Complete task
agent-tasks done "hello-world"

# 9. Save session
wrap "Completed: hello endpoint working"

# 10. Verify everything
echo ""
echo "Session saved! Check:"
agent-context       # Should show your decision
agent-tasks status  # Should show task done
```

---

## Quick Commands Reference

```bash
# Session start
source ~/.zshrc-wrap && agent-context

# During work
agent-decision log "topic" "decision" "reason"
agent-checkpoint save "checkpoint name"

# Task management
agent-tasks claim my-task
agent-tasks done my-task
agent-tasks next

# Team coordination
agent-share write my-agent ~/progress.md
agent-share read other-agent

# Session end
wrap "What you accomplished"

# Cleanup
agent-optimize stats
agent-optimize archive
```

---

## Next Level: Cloud Sync

Once comfortable locally:

```bash
# Deploy backend to production
# See: PRODUCTION-SETUP.md

# Then enable cloud sync
export SESSION_WRAP_API_URL="https://your-backend.railway.app"

# Test cloud sync
wrap login          # Login with your agent token
wrap               # Auto-syncs to cloud
wrap history       # View cloud backups
```

---

**Start with Example 1, progress to Example 2, then build your multi-agent team with Example 3!** 🚀
