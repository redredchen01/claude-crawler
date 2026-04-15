# /skx — Skill Ideation Report
**Date**: 2026-03-31 | **Location**: Clausidian Project | **Scope**: Full scan (no focus filter)

---

## Vault Signals Summary
- **Total notes**: 52 (14 projects, 14 resources, 12 journals, 9 ideas, 3 areas)
- **Active notes**: 41 | **Draft notes**: 11
- **Ideas in vault**: 9 (5 active, 4 draft)
- **Open TODOs**: 77 pending tasks
- **Recent activity** (14d): 50 notes updated

### Top Tags (Signal Density)
| Tag | Count | Skill Match | Gap? |
|-----|-------|------------|------|
| #automation | 14 | partial | ✓ needs consolidation |
| #reference | 12 | no | ✓ reference system gap |
| #skill | 8 | yes | — |
| #agents | 8 | yes (6 agents) | — |
| #daily | 7 | partial | ✓ daily automation |
| #monitoring | 5 | no | ✓ critical gap |
| #npm | 6 | partial | ✓ publish automation |

---

## Git Patterns (Last 20 commits across 3 repos)

### Clausidian (current)
- `feat(vault-mining)` — E3 insight pipeline
- `feat(claude-code-integration)` — deep hooks/memory integration
- `feat(phase-15-complete)` — major milestones
- `docs(skx/sfx-optimization)` — 60-80% perf gains
- **Pattern**: Infrastructure + automation features dominate

### GWX Project
- `chore(version-bump)` — 3x in last 20 (v0.25.1, v0.25.2, ongoing)
- `feat(skill-dsl)` — large refactor with conflicts
- `refactor(standardize)` — help text normalization (375 commands)
- `fix(performance/reliability)` — 4x perf/API tuning
- **Pattern**: Stable release cadence, refactoring for consistency

### TG Bot Project
- `chore(update-progress)` — daily progress tracking
- `docs(completion-reports)` — structured post-deploy docs
- `feat(anomaly-detection, scheduling)` — feature development
- `perf(sensitivity-tuning)` — continuous optimization
- **Pattern**: Monitoring + documentation focus

---

## Ideas Without Matching Skills (P1 Signals)

**Linear-Slack Bug Reporter** ✓ Explicit Request
- Created: 2026-03-31 (TODAY)
- Status: Active idea (no draft)
- Signal sources: 1/1 = explicit vault request
- Why: Manual copying of Linear bugs to Slack updates is repetitive
- Connects: Linear API + Slack Bolt + formatting

**PyPI Auto-Publish** ✓ Explicit Request
- Created: 2026-03-30
- Status: Draft idea
- Signal sources: 1 (explicit) + recurring commits (3x version-bump in 20 commits)
- Why: Version bumping + twine upload manual, can be automated
- Connects: npm-publish-auto (existing) → Python equivalent

**Vault Progress Sync** ✓ Tool Chain Gap
- Signal: #automation (14) + #reference (12) + 77 open TODOs
- Why: Obsidian ↔ GitHub/Linear bridge missing; progress trapped in vault
- Connects: Clausidian vault + GitHub Projects API + Linear API

**Agent Trace System** ✓ Explicit Request
- Created: 2026-03-30
- Status: Draft idea
- Signal sources: 1 (explicit vault idea) + recent feat commits (agent infrastructure)
- Why: Track agent operations, feed into weekly reports (append-only JSONL)
- Connects: Agent execution logging + weekly-digest skill

**Monitoring Automation** ✓ Tag-to-Skill Gap
- Tag #monitoring (5 mentions) + #daily (7 mentions) = no unified skill
- Examples in vault:
  - dashboard-observation-log (journal with manual checklist)
  - launchd-health, xhs-healthcheck (existing but disparate)
- Why: Consolidate health checks into single unified monitor
- Connects: ga4-health + launchd-health + xhs-healthcheck → unified monitor

---

## Skill Ideas (Ranked by Signal)

### P1 — High Signal (BUILD THIS WEEK)

| # | Skill | Trigger | Why P1 | Tools |
|---|-------|---------|--------|-------|
| 1 | `/linear-slack-bug-reporter` | "Check Linear bugs" or "post bugs to Slack" | Explicit request (2026-03-31) + manual workflow repetition | Linear API, Slack Bolt, Glob |
| 2 | `/vault-progress-sync` | "Sync vault to Linear" or "update projects" | #automation (14) + #reference (12) + 77 TODOs in vault | Clausidian, Linear API, GitHub API |
| 3 | `/pypi-auto-publish` | "Publish Python package" or "version bump" | Explicit idea + 3x recurring version commits | npm-publish-auto (reference), Python tools |
| 4 | `/agent-trace-system` | "Log agent run" or "agent trace" | Draft idea + agent infrastructure growing | append-only JSON logging, weekly-digest |
| 5 | `/unified-monitor` | "Monitor health" or "check status all" | #monitoring (5) + #daily (7) + 3x health check skills | ga4-health, launchd-health, xhs-healthcheck |

**Why P1**: 
- Linear-Slack: 1 explicit signal (vault request), 1 process signal (manual work)
- Vault-Progress: 2 tag signals (automation + reference), 77 open TODOs, tool chain gap
- PyPI Auto: 1 explicit idea + 3 recurring commits (version bumping)
- Agent Trace: 1 explicit idea + infrastructure signal (6 agents active)
- Unified Monitor: 2 tag signals (monitoring + daily) + 3 existing tools needing bridge

---

## P2 — Medium Signal (BUILD NEXT 2 WEEKS)

| # | Skill | Why P2 |
|---|-------|--------|
| 1 | `/vault-query-cache` | #automation (14) recurring, vault-mining recent (2026-03-31), cache optimization signal |
| 2 | `/obsidian-daily-snapshot` | #daily (7 mentions) + journal pattern (12 active journals), daily wrap-up automation |
| 3 | `/skill-health-audit` | #skill (8) + skill development active, check skill inventory drift |
| 4 | `/ai-agent-coordinator` | #agents (8) + 6 agents active, need orchestration at scale |

---

## P3 — Low Signal (BACKLOG)

- `/reference-auto-index` — #reference (12) but good coverage exists
- `/vault-backup-monitor` — #reference but lower urgency
- `/skill-changelog-bot` — skill development active but not blocking

---

## Quick Wins (< 30 min to implement)

These are 10-20 line command files that solve immediate problems:

- `/vault-todo-count` → Show pending TODOs without running full agenda
- `/skill-exists` → Quick check if skill is in inventory (filename pattern match)
- `/agent-log-tail` → Tail agent trace logs (if Phase 4 implemented)
- `/monitoring-status` → Single command shows all 3 health checks

---

## Tool Chain Gaps (Bridges Needed)

| Gap | Current State | Missing Bridge | Impact |
|-----|---------------|-----------------|--------|
| Obsidian ↔ GitHub/Linear | Vault data isolated | Progress sync skill | 77 TODOs unreachable from PM tools |
| Obsidian ↔ Slack | Manual journal copy-paste daily | daily snapshot + Slack post | 15+ min/day friction in standup |
| Git commits ↔ Automation | Patterns exist (3x version bump) | Auto-tag/trigger on commit type | Build automation opportunities |
| Vault search ↔ IDE | Clausidian CLI separate | IDE context inject | 2 tools instead of 1 |

---

## Recommendations

### Immediate (This Week)
1. **Implement `/linear-slack-bug-reporter`** — unblocks daily workflow, 1 explicit signal
2. **Implement `/pypi-auto-publish`** — eliminates 3 recurring manual commits
3. **Start `/vault-progress-sync`** — highest impact (77 TODOs + 2 tags)

### Next (Weeks 2-3)
- Implement 2-3 of the P2 skills (focus on #automation: vault-cache, daily-snapshot)
- Bridge agent infrastructure with trace system

### Track
- Create MEMORY.md entry: "High-value skill patterns — P1 signals from 2026-03-31 scan"
- Schedule re-scan in 2 weeks to detect new patterns

---

## Statistics

| Metric | Value |
|--------|-------|
| Total notes scanned | 52 |
| Ideas without skills | 3 (linear-slack-bug-reporter, agent-trace, pypi-auto) |
| High-frequency tags | 7 |
| P1 skill candidates | 5 |
| P2 skill candidates | 4 |
| P3 backlog | 3 |
| Estimated implementation time (all P1) | 10-12 hours |

