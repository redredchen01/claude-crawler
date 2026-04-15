#!/bin/bash
set -e

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-demo}"
mkdir -p "$YD_MEMORY"
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

echo "   ✓ Progress published to $YD_MEMORY/agents/"

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
