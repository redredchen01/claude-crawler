# Agent Workflow Guide v3.4.0

Complete guide for agent-driven development with session-wrap-skill's 7 coordination tools.

## Overview

The 7 tools solve key challenges in agent-driven workflows:

| Challenge | Solution |
|-----------|----------|
| No context between sessions | **agent-context** — auto-inject on startup |
| Agents step on each other | **agent-decision** + **agent-tasks** — track decisions & coordinate |
| Lost progress on error | **agent-checkpoint** — save & rollback |
| Agent A's work invisible to B | **agent-share** — cross-agent memory |
| Project knowledge scattered | **agent-knowledge** — persistent conventions |
| Memory bloat slows agents | **agent-optimize** — keep memory lean |
| Task conflicts in teams | **agent-tasks** — dependency graph |

---

## Workflow Patterns

### Pattern 1: Single Agent, Long-Term Project

**Scenario:** One agent working on a project over weeks, sessions interrupted by restarts.

**Workflow:**

```bash
# Session 1: Day 1
source ~/.zshrc-wrap
agent-context                    # Load any prior context

# Start work
agent-knowledge set architecture "Microservices: API, Auth, DB"
agent-decision log "db" "use PostgreSQL" "ACID, JSON support"
agent-tasks add "design-auth" "Implement JWT authentication"

# End session
wrap "Day 1: Database schema designed"

# ==========================================

# Session 2: Day 2 (next week after restart)
source ~/.zshrc-wrap
agent-context                    # ← Agent loads ALL past decisions & architecture
agent-tasks next                 # ← Shows "design-auth" is next
# → Agent knows: DB is PostgreSQL, JWT decision was made, why

# Continue work
agent-decision log "auth" "JWT with refresh tokens" "security + performance"
agent-tasks done "design-auth"
agent-tasks add "impl-auth" "Build JWT endpoints"

# End session
wrap "Day 2: Auth system implemented"

# ==========================================

# Month later
agent-context                    # ← Still knows all decisions from weeks ago
agent-knowledge get architecture # ← Recalls: Microservices design
agent-tasks next                 # ← Shows remaining tasks
```

**Benefits:**
- No "what were we doing?" overhead
- Decisions never overturned (logged with reasoning)
- Long-term coherence maintained

---

### Pattern 2: Multi-Agent Collaboration

**Scenario:** 3 agents (codex, cursor, windsurf) working on same project.

**Setup:**

```bash
# Day 1: Agent Codex (Backend Lead)
source ~/.zshrc-wrap

# Initialize project structure
agent-knowledge set architecture "REST API + PostgreSQL + Redis cache"
agent-knowledge set conventions "TypeScript, ESLint, 80 line limit"
agent-knowledge set tech-stack "Node.js 18, Express, TypeORM"

# Define tasks
agent-tasks add "db-schema" "Design database schema"
agent-tasks add "api-auth" "Implement auth endpoints" "db-schema"
agent-tasks add "api-users" "Implement user endpoints" "db-schema"
agent-tasks add "api-cache" "Add Redis caching" "api-auth,api-users"

# Codex claims and works on db-schema
agent-tasks claim "db-schema" "codex"
# ... work for 30 mins ...
agent-tasks done "db-schema"

# Publish progress
agent-share write codex ~/codex-db-design.md
wrap "Codex: Database schema ready"
```

**Day 2: Agent Cursor (Frontend)**

```bash
source ~/.zshrc-wrap

# Load context from codex
agent-share read codex                    # ← See what codex did
agent-context                             # ← Load architecture & conventions

# Show next available tasks
agent-tasks next
# → Output:
#   □ api-auth: Implement auth endpoints (blocked on db-schema ✓ done)
#   □ api-users: Implement user endpoints (blocked on db-schema ✓ done)

# Cursor can start either api-auth or api-users
agent-tasks claim "api-users" "cursor"
# ... work ...
agent-tasks done "api-users"
agent-share write cursor ~/cursor-users-api.md
wrap "Cursor: User API endpoints ready"
```

**Day 3: Agent Windsurf (Cache Layer)**

```bash
source ~/.zshrc-wrap

# Load context
agent-share read codex                    # Database schema
agent-share read cursor                   # User API design
agent-context                             # Architecture & conventions

# Show next tasks
agent-tasks next
# → Output:
#   □ api-cache: Add Redis caching (blocked on api-auth, api-users)
#   Both dependencies are done! Can start now.

agent-tasks claim "api-cache" "windsurf"
# ... work ...
agent-tasks done "api-cache"
wrap "Windsurf: Caching layer complete"
```

**Result:**
- No merge conflicts (each agent owns a task)
- No duplicate work (tasks prevent overlap)
- Each agent sees prior work via agent-share
- Decisions logged so agents don't undo each other

---

### Pattern 3: Decision Tracking (Why It Matters)

**Scenario:** Without decision logging, agents make conflicting choices.

**Bad (no logging):**

```
Day 1 - Agent A:
  "Let's use REST API"
  [works for 2 hours]

Day 2 - Agent B:
  "REST is too verbose, let's use GraphQL"
  [rips out REST, rebuilds with GraphQL for 4 hours]

Result: 6 hours wasted on conflict
```

**Good (with agent-decision):**

```
Day 1 - Agent A:
agent-decision log "api-style" "use REST" \
  "Simple CRUD, perfect for MVP, can migrate later"
[works for 2 hours]

Day 2 - Agent B:
agent-decision search "api-style"
# → Shows: REST chosen on Day 1, reasoning was "MVP focus"
agent-decision log "api-style-confirm" \
  "REST is correct for MVP timeline" "aligns with Day 1 decision"
[works on other features instead]

Result: 2 hours of focused work, no conflicts
```

---

### Pattern 4: Checkpoint & Recovery

**Scenario:** Agent makes risky changes, needs to revert.

```bash
# Before dangerous refactor
agent-checkpoint save "before-auth-rewrite"

# Attempt rewrite
# ... 30 mins of work ...
# Tests fail, too many edge cases

# Recover
agent-checkpoint restore before-auth-rewrite
# Back to known-good state

# Try different approach
agent-decision log "auth-refactor" "reverted to original approach" \
  "new approach had too many edge cases"
```

---

### Pattern 5: Knowledge Base Updates

**Scenario:** Agents auto-learn and share project knowledge.

```bash
# Day 1: Initialize knowledge
agent-knowledge set conventions \
  "- Use TypeScript strict mode
   - All functions must have JSDoc
   - Max line length: 80 chars
   - Snake_case for DB columns"

agent-knowledge set architecture \
  "API Gateway → Microservices → PostgreSQL
   Cache layer with Redis for hot data"

agent-knowledge set known-issues \
  "- TypeORM lazy relations cause N+1 queries
   - Session tokens need rotation every 7 days"

# Day 7: New agent reads
agent-knowledge get conventions              # Knows code style rules
agent-knowledge get architecture             # Understands system design
agent-knowledge get known-issues             # Avoids pitfalls

# Agents continuously add to knowledge
agent-knowledge set known-issues \
  "- Add: Avoid Promise.all on >10 items (memory spike)"
```

---

### Pattern 6: Memory Optimization

**Scenario:** After 3 months of sessions, memory is 500MB but agent only needs 100MB for current context.

```bash
# Check status
agent-optimize stats
# Output:
#   Sessions:    87
#   Decisions:   243
#   Knowledge:   8 topics
#   Total size:  523 MB

# Archive old sessions (keep last 3)
agent-optimize archive
# Output: Moved 84 sessions to archive/

# Summarize sessions >7 days old
agent-optimize summarize
# Output: Compressed 42 sessions to 8 MB summary

# Remove empty/duplicate entries
agent-optimize prune

# Check again
agent-optimize stats
# Output:
#   Sessions:    3 (live) + archive/
#   Decisions:   243 (never deleted, kept forever)
#   Knowledge:   8 topics
#   Total size:  45 MB  ← Much leaner
```

Agent now loads 45 MB instead of 500 MB, faster context injection!

---

## Complete Multi-Agent Example

### Project: Build a Todo API

**Goal:** 3 agents build a REST API for todos.

**Initial Setup:**

```bash
# Agent 0 (Setup)
agent-knowledge set tech-stack "Node.js, Express, PostgreSQL"
agent-knowledge set architecture "API → DB, in-memory cache for lists"
agent-knowledge set conventions "TypeScript, ESLint, 100% test coverage"

agent-tasks add "db-schema" "Create todos and users tables"
agent-tasks add "auth-api" "POST /login, POST /register" "db-schema"
agent-tasks add "todos-api" "GET/POST/PUT/DELETE /todos" "db-schema,auth-api"
agent-tasks add "cache" "Add Redis for todo lists" "todos-api"
agent-tasks add "tests" "Unit + integration tests" "auth-api,todos-api"
agent-tasks add "deploy" "Deploy to production" "tests,cache"
```

**Day 1:**

```bash
# Codex: Database
agent-tasks claim "db-schema" "codex"
# Designs: users(id, email, password_hash), todos(id, user_id, title, done)
agent-tasks done "db-schema"
agent-share write codex ~/codex-db.md
agent-decision log "db" "PostgreSQL UUID primary keys" \
  "better for distributed systems, already needed for cache keys"

# Cursor: Auth
agent-tasks claim "auth-api" "cursor"
agent-share read codex  # See DB schema
agent-context          # See decisions
# Implements: POST /register (hash password), POST /login (JWT)
agent-tasks done "auth-api"
agent-share write cursor ~/cursor-auth.md
agent-decision log "auth" "JWT stateless auth" \
  "scales better than sessions, matches todo API simplicity"

# Windsurf: Todos
agent-tasks claim "todos-api" "windsurf"
agent-share read codex   # DB schema
agent-share read cursor  # Auth design
agent-context           # See all decisions
agent-tasks next        # Confirms: can start (deps done)
# Implements: GET/POST/PUT/DELETE /todos
agent-tasks done "todos-api"
agent-share write windsurf ~/windsurf-todos.md
```

**Day 2:**

```bash
# Codex: Caching
agent-tasks claim "cache" "codex"
agent-share read windsurf      # Understand todos API
agent-context                  # Decisions and conventions
# Adds Redis cache for user's todo lists
agent-tasks done "cache"
agent-decision log "cache" "Cache invalidation on PUT/DELETE" \
  "ensures consistency, worth 50ms latency cost for 90% cache hit rate"

# Cursor: Testing
agent-tasks claim "tests" "cursor"
# Dependencies all met, can start
agent-share read codex          # DB and cache design
agent-share read windsurf       # API endpoints
# Writes unit tests (auth, todos) + integration tests
agent-tasks done "tests"
agent-decision log "testing" "Testcontainers for DB tests" \
  "isolation + real PostgreSQL = zero false positives"

# Windsurf: Deploy
agent-tasks claim "deploy" "windsurf"
agent-context                   # All prior knowledge
# Deploys to production
agent-tasks done "deploy"
```

**Result:**
- 3 agents, 2 days
- 6 features completed
- Zero conflicts (task graph prevented overlaps)
- 0 re-work (decisions logged so no reversions)
- 100% coherence (shared context + decisions)

---

## Quick Reference

### At Session Start

```bash
source ~/.zshrc-wrap              # Load aliases
agent-context                     # Load project context
agent-tasks next                  # See what to do next
agent-knowledge get conventions   # Recall code standards
```

### During Work

```bash
agent-decision log "feature" "chose X" "because Y"
agent-checkpoint save "stable state"
agent-share write my-agent ~/progress.md
```

### At Session End

```bash
wrap "Completed feature X"
agent-tasks done "my-task"
agent-share write my-agent ~/final-state.md
```

### For Team Coordination

```bash
agent-share list                  # See active agents
agent-share read other-agent      # Get their progress
agent-tasks status                # Full task graph
agent-tasks next                  # Available tasks
agent-optimize stats              # Memory health
```

---

## Best Practices

✅ **DO:**
- Log decisions with reasoning
- Use checkpoints before risky changes
- Keep knowledge base updated
- Claim tasks to prevent conflicts
- Archive old sessions monthly
- Review agent-tasks next before starting

❌ **DON'T:**
- Skip decision logs (you'll regret it)
- Leave tasks unclaimed (prevents overlap)
- Ignore agent-context (it's free context!)
- Delete decision files (keep forever)
- Let memory grow unbounded (optimize monthly)
- Make decisions without checking prior decisions

---

## Troubleshooting

### Agents undoing each other's work
→ Use `agent-decision log` before making changes

### Can't remember why a decision was made
→ `agent-decision search "keyword"`

### Memory too large (slow context injection)
→ Run `agent-optimize stats` then `agent-optimize archive`

### Task dependencies unclear
→ `agent-tasks status` shows full graph

### Lost progress on crash
→ `agent-checkpoint restore <id>`

---

## Next Steps

1. Start with Pattern 1 (single agent) to get comfortable
2. Add decision logging to all changes
3. Progress to Pattern 2 (multi-agent) when ready
4. Use knowledge base for team standards
5. Leverage task graph for 3+ agents

**With these 7 tools, your agent-driven workflow becomes coherent, scalable, and conflict-free!** 🚀
