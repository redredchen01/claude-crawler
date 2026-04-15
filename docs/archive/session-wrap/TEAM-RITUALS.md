# Team Rituals with Session Wrap

Using session-wrap to run effective team ceremonies (standups, retrospectives, planning).

---

## Overview

Session-wrap transforms team rituals from synchronous meetings to async-friendly ceremonies that save time and increase engagement.

| Ceremony | Time Saved | Improvement |
|----------|-----------|------------|
| Daily standup | 12 min/day = 60 hours/year | More detailed async, less interruption |
| Sprint planning | 1 hour/sprint | Context already loaded, better decisions |
| Retrospective | 30 min/sprint | Data-driven (metrics available) |
| Backlog refinement | 45 min/sprint | Decisions already documented |

---

## Daily Standup (Async-First)

### Traditional Standup (15 min meeting)
```
9 AM: Team joins meeting
- Alice: "Finished auth API, working on tests" (2 min)
- Bob: "Blocked on auth API" (1 min)
- Carol: "Working on UI design" (2 min)
- Manager: Q&A, context switching (10 min)
Total: 15 min × 5 people = 75 person-minutes
```

### Async Standup with session-wrap

**Morning (10 AM):** Everyone shares async

```bash
# Alice (completed work)
agent-share write alice << 'EOF'
# Daily Standup - 2026-03-26

## Completed Yesterday
- ✅ Auth API endpoints (get, post, refresh)
- ✅ Error handling tests (12 tests)
- ✅ Token validation

## Blocked By
- None (on track)

## Today's Focus
- Finish auth middleware
- Integration tests with frontend
- Ready for Bob to start login UI

## Metric
- Commits: 5
- Tests: 12 passing
- Code review: 0 (waiting on Carol)
EOF

# Bob (blocked, needs update)
agent-share write bob << 'EOF'
# Daily Standup - 2026-03-26

## Completed
- ✅ Database schema design
- ✅ API integration plan
- 🔄 Waiting on auth API (Alice)

## Blocked By
- Alice's auth API (expected today)

## Today
- Will start login UI once auth done (should be 2 PM UTC)
- Design in progress (Carol working on mockups)

## Questions
- Alice: How long until auth endpoints are ready? (needed for tests)
EOF

# Carol (design review)
agent-share write carol << 'EOF'
# Daily Standup - 2026-03-26

## Completed
- ✅ UI mockups (login, signup, dashboard)
- ✅ Design system tokens
- ✅ Accessibility review

## Ready for Review
- Login flow mockup → Bob to implement
- Signup flow mockup → Alice to comment
- Design tokens → Both to confirm

## Blocked By
- None (all async)

## Today
- Feedback incorporation (if any)
- Start onboarding flow design
EOF
```

**10:30 AM:** Manager/Tech lead reviews all shares

```bash
# Load everyone's status
agent-share read alice
agent-share read bob
agent-share read carol

# Run visualization
visualize-tasks
# Output:
# ✅ Auth API (Alice, done)
# ⏳ Login UI (Bob, waiting on Alice)
# ✅ Design (Carol, done)

# Create standup summary
cat > STANDUP-2026-03-26.md << 'EOF'
# Daily Standup Summary

## Status ✅
- Auth API: Complete (Alice)
- Design: Complete (Carol)
- Login UI: Ready to start (waiting on auth, Bob)

## Blockers
- None (cleared)

## Today's Focus
1. Alice: Complete auth middleware
2. Bob: Start login UI (once auth merged)
3. Carol: Onboarding flow design

## Metrics
- Velocity: 3 tasks completed
- No delays
- On track for sprint

## Questions Answered
- Alice → Bob: Auth endpoints ready 2 PM UTC
EOF

# Email/Slack to team
# Team reads async (not in meeting)
# Saves 15 min × 3 people = 45 minutes
```

**Advantages:**
- ✅ No meeting (asynchronous)
- ✅ More detailed (written, not rushed)
- ✅ Better decision data (metrics visible)
- ✅ No interruptions (focus time preserved)
- ✅ Works across timezones
- ✅ Creates written record (no notes needed)

---

## Sprint Planning (Async + 20 min sync)

### Traditional Sprint Planning (2-3 hours)
```
Monday 9 AM: Full team meeting
- Review backlog (45 min)
- Estimate stories (45 min)
- Discuss unknowns (30 min)
- Assign tasks (15 min)
Total: 2.5 hours × 5 people = 12.5 hours
```

### Async-First Sprint Planning

**Friday EOD (Before planning):**

```bash
# Tech lead prepares context
agent-knowledge set sprint-goals << 'EOF'
# Sprint 12 Goals (March 24-April 6)

## Focus Areas
1. Auth system (high priority, blocking features)
2. Dashboard MVP (customer-facing)
3. Performance optimization (technical debt)

## Stories in Backlog
### Auth System (12 points)
- API endpoints (Alice, 5 pts)
- Middleware integration (Alice, 3 pts)
- Error handling (Bob, 4 pts)

### Dashboard (8 points)
- Layout & design (Carol, 3 pts)
- Data integration (Bob, 5 pts)

### Performance (5 points)
- Database indexing (Alice, 3 pts)
- Caching layer (Alice, 2 pts)

## Team Capacity
- Alice: 10 pts (3 days auth, 1.5 days perf)
- Bob: 9 pts (error handling + dashboard)
- Carol: 3 pts (design)
- Buffer: 25 pts available, planning 25 pts
EOF

# Product owner adds story details
agent-decision log "sprint-12-prioritization" "Auth first, dashboard, perf" << 'EOF'
Customer feedback: Auth is blocking signups (priority)
Technical: Dashboard needed for demo (week 3)
Debt: Database slow (address now vs. later)

Decision:
1. Auth system (12 pts) - must complete
2. Dashboard (8 pts) - must complete
3. Perf (5 pts) - if time allows

Rationale: Auth unblocks other work, demo needs dashboard
EOF

# Team estimates (async, takes 30 min thinking)
agent-share write team-estimation << 'EOF'
# Story Estimates (Sprint 12)

## Auth System
- API endpoints: 5 pts (Alice & Bob consensus)
- Middleware: 3 pts (medium complexity)
- Error handling: 4 pts (edge cases needed)

## Dashboard
- Layout: 3 pts (design-heavy, less logic)
- Data integration: 5 pts (API calls + caching)

## Performance
- Indexing: 3 pts (straightforward)
- Caching: 2 pts (Redis simple)

## Total: 25 pts (perfect for sprint)
EOF
```

**Monday 10 AM (20 min sync meeting):**

```bash
# Quick sync to align
# Everyone already read context
# Just confirm & clarify

"The backlog is estimated at 25 points, perfect for our sprint.
Auth blocks nothing, we have consensus on estimates.
Questions?"

# Alice: "Middleware is 3 points? That includes integrating with routes?" (1 min)
# Tech lead: "Yes, all integration. But if it's complex, we split it. Check with API first." (1 min)

# Bob: "Error handling - do we include retry logic?" (1 min)
# Product: "Yes, but MVP version (exponential backoff). See story #456." (1 min)

# Carol: "Layout design - I'll use design system tokens, does that work?" (1 min)
# Team: "Perfect, reduces work." (1 min)

# Final: "Sprint starts now. Alice owns auth, Bob owns dashboard, Carol owns design." (5 min)
```

**Advantages:**
- 🕐 Meeting: 20 min (vs. 2.5 hours)
- 📊 Better estimates (async thinking time)
- 🎯 Faster decisions (context pre-loaded)
- 🔄 Room for discussion (but focused)
- 📝 Written decisions (no confusion later)

---

## Sprint Retrospective (Data-Driven)

### Traditional Retro (1 hour meeting)
```
Friday 3 PM: Team discusses sprint
- Went well? "We finished auth" (10 min)
- Could improve? "Communication could be better" (10 min)
- Action items? "Let's have daily standups" (10 min)
- Vague, emotional, forgetting details (30 min overhead)
Total: 1 hour × 5 people = 5 hours
```

### Data-Driven Retro with session-wrap

**Friday EOD (Before retro):**

```bash
# Tech lead generates metrics
timeline
# Output:
# Session velocity: 8 tasks/sprint (vs 6 target)
# Decision frequency: 12 decisions made
# Checkpoint usage: 3 rollbacks (no critical issues)
# Memory usage: Stable 5 MB

visualize-tasks
# Output:
# ✅ Auth API: Complete
# ✅ Middleware: Complete
# ✅ Dashboard: Complete (89%)
# ⭐ Performance: Not started (low priority, ok)

analyze-decisions
# Output:
# Most common theme: "API design" (4 decisions)
# Trade-offs discussed: 8 decisions with trade-offs documented
# Consensus: 92% agreement rate (high)

# Collect written feedback (async, 24h before retro)
agent-share write team-retro-feedback << 'EOF'
## Alice's Retro Input

### What Went Well
✅ Auth API design was clear (good planning)
✅ Middleware integration smooth (good specs)
✅ Fewer bugs than usual (better tests)

### What Could Improve
🔧 API versioning unclear (caused 2 questions)
🔧 Database schema feedback loop was slow

### Suggestion
Let me document API versioning early next sprint.
EOF

# Bob's feedback
agent-share write bob-retro << 'EOF'
### What Went Well
✅ Dashboard fast (Alice's API was efficient)
✅ Carol's design system saved time
✅ Async coordination worked great

### What Could Improve
🔧 Frontend/backend sync took 2 extra days
🔧 Staging environment unstable (lost 4 hours)

### Suggestion
- Pre-deploy checklist for staging
- Daily frontend/backend check-in (15 min)
EOF

# Carol's feedback
agent-share write carol-retro << 'EOF'
### What Went Well
✅ Design tokens reusable (Bob & Alice both used)
✅ Accessibility reviews caught issues early
✅ No design rework needed

### What Could Improve
🔧 Onboarding flow specs came late
🔧 Design iteration rounds slow (batch feedback better)

### Suggestion
- Get specs 2 days early
- Batch design reviews (once per 2 days, not daily)
EOF
```

**Friday 3 PM (30 min retro meeting):**

```bash
# Everyone already submitted feedback
# Meeting is just discussion & decisions

"Sprint 12 metrics:
- Completed: 25 story points (vs 25 target) ✅
- Quality: 0 critical bugs
- Decisions: 12 (well-documented)
- Velocity: On track

Feedback themes:
- Communication working great (async)
- Staging environment issues (need fix)
- Timeline planning could improve

Next sprint focus:
1. API versioning docs (Alice will own)
2. Staging checklist (DevOps will own)
3. Spec timeline (Product will adjust)

Questions?" (10 min)

# Quick discussion:
# Bob: "Staging - I can help create checklist" → Assigned
# Alice: "API versioning - I'll write guide" → Confirmed
# Product: "Specs earlier - I'll adjust timeline" → Committed

# Close: "Great sprint, shipping on Monday!" (5 min)
```

**Advantages:**
- ⏱️ Meeting: 30 min (vs 60 min traditional)
- 📊 Data-driven (metrics visible)
- 🎯 Focused (feedback pre-written)
- 📝 Decisions recorded (no follow-up confusion)
- 🔄 Faster action items (already discussed)

---

## Backlog Refinement (Async Comments)

### Async Decision Making

```bash
# Product owner proposes new story
agent-share write backlog-sprint-13 << 'EOF'
# Story: Mobile Responsiveness (8 points)

## Description
Make dashboard work on mobile (iPad, iPhone)

## Acceptance Criteria
- Responsive layout (grid breaks at 768px)
- Touch-friendly buttons (44px min)
- Performance: < 2s load on 4G
- All features work on mobile

## Technical Notes
- Use Tailwind responsive (we already have)
- Test on real devices (not just browser)
- Loading states for slow networks

## Estimate: 8 Points
- Carol: 3 pts design
- Bob: 5 pts implementation

## Questions
- Any performance concerns?
- Device compatibility scope? (Safari, Chrome, Edge?)
- Fallback for old browsers?
EOF

# Alice comments (10 min thinking, 5 min write)
agent-share write alice-comment << 'EOF'
# Mobile Story - Technical Comments

Good story. Few questions:

1. Performance target is 2s on 4G - do we have baseline?
   → If current is 5s, might need perf work first
   → Suggest: measure first (1 task), then design

2. Device testing - which devices?
   → iPhone 12+, iPad Air+? Or older?
   → Affects CSS/JS compatibility

3. Safari/Chrome/Edge - what about:
   → Firefox? (some desktop users)
   → Samsung Internet? (Android)

Recommendation:
- Split into Phase 1 (modern browsers) + Phase 2 (older)
- Measure performance first (1 pt)
- Design + implement (7 pts)

I can handle responsive CSS, but need decision on baseline.
EOF

# Carol comments (design perspective)
agent-share write carol-comment << 'EOF'
# Mobile Design - Notes

Nice story! Responsive design is important.

Design questions:
1. Sidebar on mobile - hamburger menu or bottom nav?
   → I suggest: hamburger (industry standard)
   → Frees vertical space

2. Charts/graphs - smaller screens
   → Table view? Scrollable? Switch to cards?
   → Currently assumed cards (easier on mobile)

3. Touch targets (44px) - already designed for
   → All buttons hit this
   → Ready to build

Design effort: 3 pts (layout changes, responsive grid, mobile nav)
Alice's point about perf is good - measure first.
EOF

# Bob comments (engineering perspective)
agent-share write bob-comment << 'EOF'
# Mobile Implementation

Thoughts:

1. Performance: Alice is right. Current load is slow on mobile.
   → API calls slow on 4G
   → React re-renders expensive
   → I'll profile before starting (1 pt separate)

2. Responsive CSS: Carol's hamburger menu works.
   → Tailwind breakpoints: sm (640px), md (768px)
   → Current CSS mostly responsive already
   → ~2 pts new CSS

3. Charts: They scale okay, but text gets small
   → Agree with cards approach for mobile
   → Need Carol's mockup (waiting on design)

4. Testing: I'll test on:
   → Chrome (desktop + Android)
   → Safari (desktop + iOS)
   → Older iPhone (5S?) for baseline

Estimate: 5 pts seems right
- 1 pt: Performance baseline
- 2 pts: Responsive CSS
- 2 pts: Mobile navigation

But suggest: Do performance work FIRST, separate story.
EOF

# Product owner incorporates feedback
agent-decision log "mobile-refinement" "Split mobile + perf into 2 stories" << 'EOF'
Original: Mobile story (8 pts)

After team feedback:
- Performance baseline (1 pt) - separate story
- Mobile responsive design (7 pts) - original story

Reasoning:
- Performance is blocker (Alice & Bob both flagged)
- Measure first, optimize later
- Cleaner separation of concerns

Updated: 2 stories instead of 1
EOF

# Updated story posted
agent-share write backlog-updated << 'EOF'
# Story: Mobile Responsiveness (Updated)

Based on team feedback:

## Story 1: Measure Performance Baseline (1 pt)
- Measure current load time on 4G
- Document bottlenecks (API? React?)
- Recommend optimizations

## Story 2: Mobile Responsive Design (7 pts)
- Responsive grid (Tailwind)
- Hamburger navigation (Carol design)
- Mobile-optimized charts (card view)
- Test on real devices (Chrome/Safari)

Acceptance Criteria:
- Responsive < 768px ✅
- 44px+ touch targets ✅
- Load < 2s on 4G ✅ (after perf story)
- Works on iPhone/iPad ✅

Ready to start next sprint!
EOF
```

**Advantages:**
- No meeting needed (async discussion)
- Deep thinking time (not rushed)
- Comments documented (reference later)
- Better decisions (multiple perspectives)
- Clear ownership (who does what)

---

## Incident Retrospective (Prevent Recurrence)

### Post-Incident Process

**During Incident:**
```
3:47 PM: Auth service down
4:02 PM: Issue identified (database connection pool exhausted)
4:15 PM: Fixed (restarted service)
4:20 PM: Customers notified
Impact: 33 minutes of downtime
```

**After Incident (Next day):**

```bash
# Team lead documents incident
agent-decision log "auth-service-outage-20260326" << 'EOF'
## Incident: Auth Service Outage

### What Happened
- 2026-03-26 3:47 PM UTC: Auth service stopped responding
- Root cause: Database connection pool exhausted
- Duration: 33 minutes
- Customers affected: ~500 (couldn't login)

### Root Cause
Connection pool was set to 10 (too low)
- Service spun up but ran out of connections quickly
- No alerting on pool exhaustion
- Manual restart recovered it

### Immediate Fix
- Increased pool to 30 (temporary)
- Added monitoring for pool usage

### Prevention
1. Add alerting: Trigger alert when pool > 80%
2. Auto-scaling: Handle spikes automatically
3. Load testing: Test with realistic load before release
4. Runbook: Document connection pool settings

### Owner Assignments
- DevOps: Add alerting + auto-recovery (1 sprint)
- Backend (Alice): Load test auth service (3 days)
- SRE: Update connection pool documentation (1 day)

### Review Cadence
- 3-month follow-up: Verify fixes working
- Include in incident review quarterly
EOF

# Team reviews incident
agent-share read incident-analysis

# Prevent recurrence
agent-tasks add "auth-pool-alerting" "Add database pool monitoring" "" "infrastructure"
agent-tasks add "auth-load-test" "Load test auth service" "auth-pool-alerting" "backend"

# Document for future
agent-knowledge set incidents << 'EOF'
## Incident: Auth Service Outage (2026-03-26)

**Root Cause:** Connection pool exhaustion (10 connections too low)

**Prevention:**
- Monitor pool usage (alert at 80%)
- Auto-scaling for spikes
- Load test before release

**Timeline:**
- Detected: 3:47 PM (outage) → 4:02 PM (diagnosis) = 15 min
- Fixed: 4:02 PM → 4:15 PM = 13 min
- Recovery: 4:15 PM → 4:20 PM = 5 min (comms)

**Why It Happened:**
- Service launched without pool testing
- Realistic load discovered pool too small
- Manual fix restored, but underlying issue remained

**How Future Incidents Prevention:**
- All database services: Load test before release
- Pools: Auto-scale or alert at 80%
- Services: Have monitoring + runbook
EOF

# 3 months later: Verify fix worked
# Team checks: "Did pool alerting prevent outage?"
timeline
# Shows: No auth outages in 3 months ✅
```

**Advantages:**
- 📝 Documented reasoning (not lost)
- 👥 All teams learn (not just affected team)
- 🔄 Prevents recurrence (permanent fix)
- 📊 Metrics track improvements (alerting prevented 2 more outages)

---

## Weekly Sync (Optional, Async-Light)

**For teams wanting synchronous check-in (optional):**

```bash
# Monday 10 AM: 15-minute team check-in

"Let's do quick alignment.

Updates since Friday:
- Alice: Auth tests complete, 95% coverage
- Bob: Dashboard blocked on design (Carol?)
- Carol: Design ready, Bob can start Tuesday

Blockers:
- None (all clear)

Goals for rest of week:
1. Alice: Finish API docs
2. Bob: Complete dashboard
3. Carol: Start onboarding design

Any fires? No? Great, let's focus."
```

---

## Ritual Implementation Checklist

### Week 1: Setup
- [ ] Create memory directories (decide, knowledge, agents, tasks)
- [ ] Document project conventions (agent-knowledge)
- [ ] Set up team aliases (everyone sources .zshrc-wrap)
- [ ] Run first agent-context (verify everyone can load context)

### Week 2: Daily Standup
- [ ] Switch to async standup (everyone uses agent-share write)
- [ ] Manager reviews with visualize-tasks
- [ ] Publish daily summary (email or Slack)
- [ ] Measure time saved (target: 12 min/day reduction)

### Week 3: Decisions
- [ ] Log important decisions (agent-decision log)
- [ ] Make decisions searchable (agent-decision search)
- [ ] Reference decisions in discussions ("as we decided on...")
- [ ] Measure: Fewer repeated questions?

### Week 4: Tasks
- [ ] Create sprint tasks (agent-tasks add)
- [ ] Use agent-tasks claim (prevent conflicts)
- [ ] Mark done when complete (agent-tasks done)
- [ ] Use visualize-tasks for planning

### Week 5+: Rituals
- [ ] Async sprint planning (pre-load context)
- [ ] Data-driven retrospective (timeline + metrics)
- [ ] Async backlog refinement (comments in agent-share)
- [ ] Incident post-mortems (decision log + prevention)

---

## FAQs

### Q: What if someone misses a standup?

**A:** They just read the agent-share writes later. No FOMO, full context available.

### Q: How do we make decisions if not synchronous?

**A:** Via agent-decision log. Team comments on agent-share. Leads decide with full input.

### Q: Do we ever need synchronous meetings?

**A:** Rarely. Examples that benefit:
- Sprint planning alignment (15-20 min after async prep)
- Quick unblocks (if someone truly stuck)
- All-hands (culture, celebration, strategy)

### Q: What if decisions contradict?

**A:** All decisions logged. Easy to find conflict and resolve. Prevents repeats.

### Q: How do remote teams benefit most?

**A:** Async-first eliminates timezone pressure. Core hours not required.

---

## Sample Ritual Schedule

```
Monday
- 9:30 AM: Async stands (everyone posts)
- 10:30 AM: Manager reviews + summary
- No meeting needed

Tuesday-Thursday
- Async standups only
- Focus time for work

Friday
- 3 PM: Sprint retro (30 min, data-driven)
- EOD: Share retro feedback (async)

Weekly
- Product reviews decisions made
- Data shows: clarity up, repeats down
```

---

**Rituals powered by session-wrap are faster, better documented, and work across any timezone.** 🎯
