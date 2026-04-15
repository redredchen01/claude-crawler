# Real-World Workflow: Startup Team (3 People)

**Scenario:** Small startup building a SaaS product with 3 engineers
- **Alice** — Backend/Infrastructure
- **Bob** — Frontend/Full-stack
- **Carol** — Product/DevOps

**Duration:** 4-week sprint
**Team Setup:** GitHub, Slack, shared memory on cloud

---

## Week 1: Project Kickoff

### Monday: Alice Sets Up Infrastructure

```bash
# Start session
source ~/.zshrc-wrap
agent-context              # Empty on first run

# Initialize project knowledge
agent-knowledge set architecture << 'EOF'
# SaaS Product Architecture

## Backend (Node.js + Express)
- REST API with TypeScript
- PostgreSQL database
- Redis for caching
- JWT authentication

## Frontend (React)
- Next.js for SSR
- TailwindCSS for styling
- React Query for data fetching

## Deployment
- Docker containerization
- Kubernetes for orchestration
- GitHub Actions for CI/CD
EOF

agent-knowledge set conventions << 'EOF'
- TypeScript strict mode everywhere
- All PRs require code review
- Tests must pass before merge (90% coverage minimum)
- Commit messages: imperative mood, lowercase
- Branch naming: feature/*, bugfix/*, hotfix/*
EOF

agent-knowledge set tech-stack << 'EOF'
Backend: Node.js 18, Express 4, TypeScript 5, PostgreSQL 14
Frontend: React 18, Next.js 13, TailwindCSS 3
DevOps: Docker, Kubernetes, GitHub Actions
- Hosting: AWS EKS
- Database: AWS RDS PostgreSQL
- Cache: AWS ElastiCache Redis
- DNS: AWS Route53
EOF

# Define sprint tasks
agent-tasks add "backend-auth" "Implement JWT authentication"
agent-tasks add "backend-api" "Core API endpoints" "backend-auth"
agent-tasks add "backend-db" "Database schema & migrations" "backend-api"
agent-tasks add "frontend-auth" "Login/signup UI" "backend-auth"
agent-tasks add "frontend-dashboard" "Main dashboard UI" "backend-api"
agent-tasks add "infra-docker" "Dockerfile & docker-compose"
agent-tasks add "infra-ci" "GitHub Actions pipeline" "backend-db,frontend-dashboard"
agent-tasks add "infra-k8s" "Kubernetes manifests" "infra-docker"
agent-tasks add "testing" "Integration tests" "backend-db,frontend-dashboard"

# Claim infrastructure tasks
agent-tasks claim "infra-docker" "alice"
agent-tasks claim "infra-ci" "alice"
agent-tasks claim "infra-k8s" "alice"
agent-tasks claim "backend-auth" "alice"

# Make architectural decisions
agent-decision log "auth-strategy" "JWT with refresh tokens" << 'EOF'
Stateless auth scales better than sessions.
15min access tokens + 7day refresh tokens balances security & UX.
Refresh tokens stored in httpOnly cookies (XSS-safe).
EOF

agent-decision log "database-choice" "PostgreSQL with migrations" << 'EOF'
ACID compliance critical for financial data.
Migrations in code for reproducibility.
Knex.js for schema management.
EOF

agent-decision log "containerization" "Docker for local dev, K8s for prod" << 'EOF'
Docker Compose for developer setup (no K8s complexity locally).
Kubernetes in production for auto-scaling and self-healing.
Same images used in both environments.
EOF

# Simulate work
echo "Setting up Docker infrastructure..."
sleep 2

agent-tasks done "infra-docker"
agent-checkpoint save "docker-setup-complete"

# Publish progress for teammates
agent-share write alice << 'EOF'
# Alice — Backend & Infrastructure Progress

## Day 1 (Monday) Complete ✅
- Project knowledge base initialized
- Sprint tasks defined (9 total)
- Docker infrastructure configured
- Authentication strategy decided

## Ready for Other Team Members
✅ Backend auth endpoint will be implemented tomorrow
✅ Architecture decisions documented
✅ All dependencies planned

## Important Decisions
1. JWT auth with refresh tokens
2. PostgreSQL with migrations
3. Docker + K8s deployment

## Blockers
None - ready for parallel work tomorrow

## Files
- docker-compose.yml (configured)
- .github/workflows/ci.yml (template ready)
EOF

wrap "Alice: Infrastructure foundation + architecture decisions"
```

### Tuesday: Bob Starts Frontend

```bash
# Start session
source ~/.zshrc-wrap

# Load context from Monday
agent-context              # Prints architecture, conventions, tech stack
agent-share read alice     # See what Alice did

echo "Understanding backend progress..."

# Can't start auth yet (backend not done), but can plan
agent-tasks next           # Shows what's ready vs blocked

# Start planning frontend
agent-tasks claim "frontend-auth" "bob"

agent-decision log "frontend-framework" "Next.js with TypeScript" << 'EOF'
Next.js provides SSR out of the box (better SEO).
TypeScript catches frontend bugs early.
API routes in same repo simplify deployment.
EOF

agent-decision log "styling" "TailwindCSS for rapid development" << 'EOF'
TailwindCSS speeds up UI development significantly.
Dark mode support built-in.
Smaller CSS bundle than component libraries.
EOF

# Build login page components
echo "Creating login page structure..."
sleep 2

agent-checkpoint save "login-page-structure"

# Update team on progress
agent-share write bob << 'EOF'
# Bob — Frontend Progress

## Day 1 (Tuesday) Complete ✅
- Loaded architecture and team context
- Reviewed Alice's infrastructure decisions
- Planned frontend tech stack
- Created login page structure (waiting for auth API)

## Ready Next
- Auth API from Alice (needed for integration)
- Can proceed with dashboard UI if API schema is ready

## Blocked On
- backend-auth endpoint (Alice working on this)

## Component Structure
- /components/auth/LoginForm.tsx
- /components/auth/SignupForm.tsx
- /pages/auth/login.tsx
- /hooks/useAuth.ts

EOF

wrap "Bob: Frontend structure + decided on Next.js + TailwindCSS"
```

### Wednesday: Carol Joins (DevOps Focus)

```bash
# Carol joins to set up DevOps
source ~/.zshrc-wrap

# Understand project state
agent-context              # See all decisions and architecture
agent-share read alice     # Backend progress
agent-share read bob       # Frontend progress

agent-tasks next           # See what's available

# Carol will handle CI/CD when APIs are ready
agent-tasks claim "infra-ci" "carol"

agent-decision log "deployment-pipeline" "GitHub Actions -> AWS EKS" << 'EOF'
GitHub Actions is free for public repos.
AWS EKS provides managed Kubernetes.
Auto-deploy on merge to main after tests pass.
EOF

agent-decision log "monitoring" "DataDog for observability" << 'EOF'
DataDog integrates with EKS.
APM insights for backend performance.
Error tracking and alerting setup.
EOF

# Set up monitoring skeleton
echo "Configuring DataDog integration..."
sleep 2

agent-share write carol << 'EOF'
# Carol — DevOps Progress

## Day 1 (Wednesday) Complete ✅
- Understood full architecture
- Planned CI/CD pipeline
- Set up monitoring strategy
- DataDog integration scaffolding

## Status
Ready to build CI/CD once Alice has:
- Backend auth API working
- Database schema finalized

Frontend and backend dependencies clear.

## Next Steps
1. Wait for backend API container image
2. Write Kubernetes manifests
3. Set up automated deploy pipeline

EOF

wrap "Carol: DevOps strategy + monitoring setup"
```

### Team Sync (Wednesday Evening)

```bash
# Carol runs team visualization
echo "=== TEAM STATUS REPORT ==="
echo ""
visualize-tasks
echo ""
echo "=== DECISIONS MADE ==="
analyze-decisions
echo ""
echo "=== MEMORY USAGE ==="
memory-report
```

**Output:**
```
Progress: ███░░░░░░░░░░░░░░░░ 30% (3/9)

✅ Done:        1 (infra-docker)
⏳ In Progress: 3 (backend-auth, frontend-auth, infra-ci)
⭐ Pending:     5 (others blocked)

Dependency Tree:
  ⭐ backend-auth (Alice: in progress)
     ├─ ✅ infra-docker (done)
     ├─ ⭐ frontend-auth (Bob: ready after backend)
     └─ ⭐ infra-ci (Carol: ready after backend)

Total Decisions: 6
Per Person: Alice 3, Bob 2, Carol 1
Common themes: scalability, security, developer experience
```

---

## Week 2: Core Features

### Monday: Alice Ships Auth API

```bash
# Morning standup
visualize-tasks          # Shows current progress
timeline                 # Project velocity

# Alice continues backend
agent-tasks claim "backend-auth" "alice"

# Implement the decision from week 1
agent-decision log "token-expiry" "Access: 15min, Refresh: 7days" << 'EOF'
Short access token reduces XSS damage window.
Longer refresh allows users to stay logged in.
7day timeout forces periodic re-authentication.
EOF

# Make progress
echo "Implementing JWT endpoints..."
sleep 2

agent-tasks done "backend-auth"
agent-checkpoint save "auth-api-complete"

# Publish for Bob and Carol
agent-share write alice << 'EOF'
# Auth API Complete ✅

## Endpoints
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- GET /auth/me

## Response Format
```json
{
  "status": "ok",
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "user": { "id": "...", "email": "..." }
  }
}
```

## Testing
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass"}'

Ready for Bob's frontend integration!

EOF

wrap "Alice: Auth API implemented and tested"
```

### Tuesday: Bob Integrates Auth

```bash
# Bob reads Alice's auth API
agent-share read alice     # Get endpoint details

# Now can implement login
agent-tasks claim "frontend-auth" "bob"

agent-decision log "token-management" "Memory + httpOnly cookies" << 'EOF'
Access token in memory (cleared on page reload = auto logout).
Refresh token in httpOnly cookie (immune to XSS).
Axios interceptor auto-refreshes when 401 received.
EOF

echo "Integrating auth endpoints..."
sleep 2

agent-tasks done "frontend-auth"

agent-share write bob << 'EOF'
# Frontend Auth Integration ✅

## Implementation
- LoginForm component integrated with API
- Auto-login redirect to dashboard
- Token storage per security plan
- Error handling for auth failures

## Testing
1. Create account via signup
2. Login with credentials
3. Token auto-refresh when expired
4. Logout clears memory token

Ready for main dashboard features!

EOF

wrap "Bob: Frontend auth integration complete"
```

### Wednesday: Carol Ships CI/CD

```bash
# Carol can now build pipeline (both APIs ready)
agent-tasks claim "infra-ci" "carol"

agent-decision log "branch-protection" "Require tests before merge" << 'EOF'
GitHub branch protection enforces CI passing.
No manual bypasses allowed.
Prevents broken code reaching main.
EOF

echo "Building GitHub Actions workflow..."
sleep 2

agent-tasks done "infra-ci"

wrap "Carol: CI/CD pipeline functional"
```

---

## Week 3: Scale & Polish

### Daily Workflow Pattern

**Every Morning:**
```bash
source ~/.zshrc-wrap
visualize-tasks            # "What's our status?"
timeline                   # "How fast are we going?"
agent-tasks next           # "What should I work on?"
agent-share read alice     # Check other team members' progress
agent-share read bob
agent-share read carol
```

**During Work:**
```bash
agent-decision log "feature-X" "chose approach Y" "reason Z"
agent-checkpoint save "before-risky-change"
agent-tasks done "completed-task"
```

**End of Day:**
```bash
wrap "Completed X, blocked on Y, ready for Z"
```

### Sample Decision Log from Week 3

```
Monday: caching-strategy → Redis for session storage
Tuesday: rate-limiting → Leaky bucket algorithm
Wednesday: error-handling → Structured error codes
Thursday: validation → Joi schemas for all inputs
Friday: performance → Query optimization + indexing
```

**Run:** `analyze-decisions` to see patterns:
```
Total Decisions: 25
Per Category:
  - Architecture: 8
  - Security: 6
  - Performance: 5
  - UX: 4
  - DevOps: 2

Common Keywords:
  - security (6 times)
  - performance (5 times)
  - scalability (4 times)
  - user experience (3 times)
```

---

## Week 4: Launch Preparation

### Thursday: Team Code Freeze

```bash
# Thursday: No new features, only bug fixes

# Review all decisions
analyze-decisions

# Check system health
memory-report              # "Is memory reasonable?"
visualize-tasks            # "Are all tasks done?"
timeline                   # "What was our velocity?"

# Output:
# Progress: ███████████████████████░ 85% (17/20)
# Tasks done: 17, in progress: 2, pending: 1 (blocking bug)
```

### Friday: Launch

```bash
# Final push - fix last blocking issue
agent-tasks status         # Show full graph
agent-checkpoint save "pre-launch"

# All systems go
echo "🚀 LAUNCHING PRODUCT"

# Post-launch
wrap "🎉 Product launched! 17 features, 25 decisions, zero incidents"

# Create launch summary
cat > LAUNCH_SUMMARY.md << 'EOF'
# Product Launch Summary

## Team: Alice, Bob, Carol
## Duration: 4 weeks
## Outcome: ✅ Shipped

### Statistics
- Tasks Completed: 17/20
- Decisions Made: 25
- Zero critical bugs
- All tests passing (92% coverage)

### Key Decisions
1. JWT auth with refresh tokens
2. PostgreSQL for data persistence
3. Next.js for frontend
4. Docker + Kubernetes for infrastructure
5. GitHub Actions for CI/CD

### Velocity
- Week 1: 1 task/person
- Week 2: 2 tasks/person
- Week 3: 2.5 tasks/person (team flow established)
- Week 4: 1 task/person (quality focus)

### Memory Usage
- Sessions: 12 (one per work day)
- Decisions: 25 (documented why we chose everything)
- Memory: 3.4 MB (compressed, includes all decisions forever)

### Lessons Learned
- Session-wrap prevented context loss between days
- Decision logging caught consistency issues early
- Task dependency graph prevented bottlenecks
- Team coordination was seamless

EOF

git add LAUNCH_SUMMARY.md && git commit -m "launch: shipped product with session-wrap coordination"
```

---

## Key Patterns for Startup Teams

### 1. Daily Standup (5 minutes)

```bash
# Alice
visualize-tasks
echo "Status: [show what's done, in progress, blocked]"

# Bob
timeline
echo "Yesterday: [show velocity], Today: [what I'm doing]"

# Carol
agent-share list
echo "Team progress: [summary of all agent states]"
```

### 2. Decision Quality

Every meaningful choice goes in session-wrap:
```bash
agent-decision log "database-pool-size" \
  "Set to 20 connections" \
  "Load testing showed 90% utilization at peak. 20 provides buffer."
```

This prevents: "Wait, why did we choose X?" and "Let's reconsider Y" loops.

### 3. Async Communication

Instead of Slack threads, decisions are in the system:

```bash
# Bob wonders: Should we use Redis or Memcached?
agent-decision search "cache"
# See: Alice already decided → Redis (better persistence)

# Carol wonders: Why JWT not OAuth?
agent-decision search "auth"
# See: Alice's reasoning → stateless, easier to scale

# No meetings needed - information is persistent and searchable
```

### 4. Velocity Tracking

```bash
# Week 1: timeline shows 1 task/person
# Week 2: timeline shows 2 tasks/person
# Week 3: timeline shows 2.5 tasks/person (flow state achieved!)
# Week 4: timeline shows 1 task/person (quality focus)

# Founders can see: "Team is accelerating, shipping coherently"
```

### 5. Onboarding New Engineers

When hiring engineer #4:

```bash
# New engineer runs:
agent-context full          # See all architecture & conventions
analyze-decisions           # Understand why we chose everything
visualize-tasks             # See what needs doing
timeline                    # Understand team rhythm
agent-share read alice      # What backend looks like
agent-share read bob        # What frontend looks like
agent-share read carol      # What infrastructure looks like

# No 2-hour onboarding meeting needed - all context is in session-wrap
```

---

## Common Mistakes (and How to Avoid Them)

### ❌ Mistake 1: Logging decisions after the work

```bash
# Bad: Decision after 2 days of coding
git commit -m "refactor auth"
agent-decision log "auth-strategy" "JWT" "..."  # Too late!

# Good: Decision before coding
agent-decision log "auth-strategy" "JWT" "..."
git commit -m "implement JWT auth (per decision log)"
```

### ❌ Mistake 2: Task graph out of sync

```bash
# Bad: Forgetting to mark tasks done
agent-tasks claim "feature-x"
# ... 2 days of work ...
# (forgot to run agent-tasks done)

# Good: Update as you go
agent-tasks claim "feature-x"
# ... work ...
agent-tasks done "feature-x"  # Immediately after PR merges
```

### ❌ Mistake 3: No checkpoint before risky changes

```bash
# Bad: Refactoring without safety net
git refactor.sh
# Oops, broke everything

# Good: Checkpoint first
agent-checkpoint save "before-auth-refactor"
git refactor.sh
# If broken, just: agent-checkpoint restore "before-auth-refactor"
```

---

## Success Metrics for Startup Teams

✅ **Context Preservation**: New session loads full context instantly
✅ **Zero Rework**: Decisions prevent "should we reconsider X?" loops
✅ **Async Communication**: Team coordinates without meetings
✅ **Velocity Tracking**: Can see team acceleration week over week
✅ **Launch Readiness**: All decisions documented, all tests passing

---

## Tools Used in This Workflow

| When | Tool | Command |
|------|------|---------|
| **Morning standup** | Visualization | `visualize-tasks && timeline` |
| **Planning meeting** | Context | `agent-context && agent-tasks next` |
| **Making decisions** | Decision log | `agent-decision log ...` |
| **Sharing progress** | Cross-agent | `agent-share write/read` |
| **End of day** | Session wrap | `wrap "summary"` |
| **Weekly review** | Analysis | `analyze-decisions && memory-report` |
| **Before risky change** | Checkpoint | `agent-checkpoint save` |

---

## Session-Wrap ROI for Startups

| Benefit | Time Saved | Quality Improvement |
|---------|-----------|-------------------|
| No context loss between days | 30 min/person/day | High |
| Decisions prevent rework | 2-3 hours/week | Very High |
| Async communication | 1 hour/day (no meetings) | High |
| Velocity visibility | 15 min/week planning | High |
| Onboarding new engineers | 2 hours → 0 | Very High |

**Total:** 4-5 hours/person/week saved = **20+ hours/week for 3 people**

That's nearly **1 full engineer-week per week** just from coordination overhead reduction.

---

**This is what session-wrap enables for small, fast-moving teams.** 🚀

