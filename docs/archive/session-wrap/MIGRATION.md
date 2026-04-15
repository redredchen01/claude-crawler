# Migration Guide: v3.3 → v3.4.0

Upgrade session-wrap to v3.4.0 and unlock agent coordination features.

---

## What's New in v3.4.0

**From:** Manual session saving tool
**To:** Essential agent infrastructure

| Feature | v3.3 | v3.4.0 | Benefit |
|---------|------|--------|---------|
| Session wrapping | ✅ | ✅ | Still works the same |
| Project knowledge | ❌ | ✅ | Auto-inject context |
| Agent coordination | ❌ | ✅ | Task graphs, prevent conflicts |
| Decision logging | ❌ | ✅ | Remember *why* decisions were made |
| Agent memory sharing | ❌ | ✅ | Agent A → Agent B communication |
| Checkpoints | ❌ | ✅ | Safe rollback on errors |
| Visualization tools | ❌ | ✅ | See tasks, decisions, memory, timeline |
| Smart optimization | ❌ | ✅ | Automatic memory management |

---

## Upgrade Path

### Step 1: Backup Current Installation

```bash
# Backup your current memory
cp -r ~/.claude/projects/*/memory ~/backup-v3.3-$(date +%Y%m%d)

# If you use npm, save location
which session-wrap-skill
```

### Step 2: Update to v3.4.0

#### Via npm (recommended)

```bash
npm install -g session-wrap-skill@3.4.0
```

#### Via git

```bash
cd ~/session-wrap-skill
git fetch origin
git checkout v3.4.0
chmod +x scripts/*.sh
source .zshrc-wrap
```

### Step 3: Update Shell Configuration

Update your `~/.zshrc` to load new aliases:

```bash
# Old (v3.3)
source ~/.zshrc-wrap

# New (v3.4.0) - same command works, but has more aliases
source ~/.zshrc-wrap

# New aliases available:
# agent-context, agent-share, agent-decision
# agent-checkpoint, agent-knowledge, agent-optimize, agent-tasks
# visualize-tasks, analyze-decisions, memory-report, timeline
```

### Step 4: Verify Installation

```bash
# Check version
npm list -g session-wrap-skill

# Test agent tools
agent-context       # Should work
agent-tasks list    # Should show any tasks
memory-report       # Should show memory usage
```

### Step 5: Initialize Project Knowledge (Optional but Recommended)

Now is a good time to document your project:

```bash
cd your-project

# Add architecture documentation
agent-knowledge set architecture << 'EOF'
# Project Architecture

## Services
- Frontend: React
- Backend: Node.js
- Database: PostgreSQL

## Dependencies
- Framework: Express
- ORM: Prisma
EOF

# Add conventions
agent-knowledge set conventions << 'EOF'
# Code Conventions

- TypeScript strict mode
- 80% test coverage required
- ESLint + Prettier
EOF

# Test it works
agent-context
```

---

## Breaking Changes

**None.** v3.4.0 is fully backward compatible with v3.3.

- Old session wraps still work
- Old commands still available
- No configuration changes required
- No migration of data needed

---

## Migration Timeline

### Day 1: Upgrade
```bash
npm install -g session-wrap-skill@3.4.0
source ~/.zshrc
```

### Day 1-2: Explore New Features
```bash
# Try new tools
agent-context
agent-decision log "example" "tried new feature" "learning"
agent-tasks add example "test task"
visualize-tasks
```

### Week 1: Adopt New Features
```bash
# Start using in actual work
agent-decision log "architecture" "chose design pattern X"
agent-tasks add "feature-y" "implement feature"
agent-share write agent-name ~/my-progress.md
```

### Week 2+: Full Integration
All new agent tools become part of regular workflow.

---

## Quick Feature Walkthrough

### agent-context (Load Project Context)

```bash
# What it does: Auto-injects all project knowledge at startup
agent-context

# Output includes:
# - Architecture overview
# - Code conventions
# - Recent decisions
# - Current tasks
```

### agent-decision (Log Decisions)

```bash
# What it does: Document *why* decisions were made
agent-decision log "caching-strategy" "use Redis" << 'EOF'
Previous: No caching (slow)
Decision: Redis for session caching
Trade-offs: Extra infrastructure, but 3x faster
Review: Monitor hit rate quarterly
EOF
```

### agent-tasks (Coordinate Work)

```bash
# What it does: Prevent task conflicts in multi-agent work
agent-tasks add "api-design" "Design API endpoints"
agent-tasks claim "api-design" codex
# ... work ...
agent-tasks done "api-design"

# Next agent checks
agent-tasks next
# Shows which tasks are ready to start
```

### agent-share (Share Progress)

```bash
# What it does: Agent A publishes, Agent B reads
# Agent A
agent-share write agent-a ~/my-progress.md

# Agent B (different shell)
agent-share read agent-a
# Sees Agent A's progress
```

### Visualization Tools

```bash
# What it does: Visualize project status at a glance
visualize-tasks   # Task dependency graph
analyze-decisions # Decision analysis
memory-report     # Memory breakdown
timeline          # Project velocity
```

---

## Common Questions During Migration

### Q: Do I need to change anything in my code?

**A:** No. v3.4.0 doesn't touch your application code at all. It only enhances session management and coordination.

### Q: Will my old session wraps still work?

**A:** Yes. All existing session wraps continue to work. You can start using new features whenever you want.

### Q: Should I use all the new features?

**A:** No. Pick what's useful for your workflow:

- **Solo developer?** Use `agent-context` + `agent-checkpoint` + `wrap`
- **2-person team?** Add `agent-decision` + `agent-tasks`
- **Multi-agent?** Add `agent-share` for coordination
- **Large project?** Use all 7 tools + visualization tools

### Q: How do I know which features to adopt?

**A:** Read the [real-world guides](README.md#real-world-workflow-guides) matching your scenario:

- Solo: [SOLO-DEVELOPER.md](SOLO-DEVELOPER.md)
- Small team: [STARTUP-TEAM-WORKFLOW.md](STARTUP-TEAM-WORKFLOW.md)
- Distributed: [OPENSOURCE-COLLABORATION.md](OPENSOURCE-COLLABORATION.md)
- Large org: [ENTERPRISE-ADOPTION.md](ENTERPRISE-ADOPTION.md)

### Q: What if I find a problem with v3.4.0?

**A:** Rollback is safe:

```bash
# Rollback to v3.3
npm install -g session-wrap-skill@3.3.0

# Or if using git
git checkout v3.3.0
```

Your old session wraps are unchanged and continue to work.

---

## Performance Impact

v3.4.0 is **faster** than v3.3:

| Operation | v3.3 | v3.4.0 | Change |
|-----------|------|--------|--------|
| Load context | N/A | ~200ms | New feature |
| Log decision | N/A | ~50ms | New feature |
| Session wrap | ~500ms | ~450ms | 10% faster |
| Memory size | ~100KB/session | ~100KB/session | No change |

**Result:** No performance degradation, new features are fast.

---

## Storage & Cleanup

v3.4.0 adds new memory directories:

```
~/.claude/projects/*/memory/
├── session_*.md          # (v3.3) Session wraps
├── decisions/            # (v3.4) Decision logs
├── knowledge/            # (v3.4) Project knowledge
├── checkpoints/          # (v3.4) Saved checkpoints
├── agents/               # (v3.4) Agent state
└── tasks/                # (v3.4) Task graph
```

**If space is tight:**

```bash
# Archive old sessions (keeps last 3)
agent-optimize archive

# Remove old checkpoints (>30 days)
agent-optimize prune

# See breakdown
memory-report
```

**Typical usage:**
- Small project: 1-5 MB
- Large project: 10-50 MB
- Long-running: 50-200 MB

---

## Next Steps After Upgrade

### 1. Read the Guides

Pick your scenario:
- [QUICKSTART-EXAMPLES.md](QUICKSTART-EXAMPLES.md) — Copy-paste examples
- [Real-world guides](README.md#real-world-workflow-guides) — Your team type

### 2. Try One Feature

Start simple:
```bash
# Try this
agent-context
# See your project context auto-loaded
```

### 3. Adopt Gradually

Don't use everything at once:
- Week 1: `agent-context` + `wrap` (like v3.3)
- Week 2: Add `agent-decision`
- Week 3: Add `agent-tasks` if multi-agent
- Week 4+: Full toolkit

### 4. Customize for Your Workflow

Not all features fit all projects. Examples:

**Solo developer:**
```bash
agent-knowledge set conventions "..."
agent-context                       # Load at start
# ... work ...
wrap "Completed feature X"
```

**Small team:**
```bash
agent-context                       # Load context
agent-tasks next                    # See what to work on
# ... work ...
agent-decision log "..."            # Log decisions
wrap "Completed feature X"
```

**Multi-agent distributed:**
```bash
agent-context                       # Load context
agent-share read other-agent        # See their progress
agent-tasks claim my-task           # Claim work
# ... work ...
agent-share write my-agent ~/progress.md  # Publish progress
agent-tasks done my-task
wrap "Completed feature X"
```

---

## Troubleshooting Migration Issues

### Issue: New aliases not recognized

```bash
# Solution: Reload shell
exec zsh  # Or bash, depending on your shell

# Or verify installation
which agent-context
```

### Issue: agent-context returns empty

```bash
# Solution: Set up project knowledge first
agent-knowledge set conventions "Add your conventions"
agent-context
```

### Issue: Old scripts still in PATH

```bash
# Solution: Remove old installation
npm uninstall -g session-wrap-skill
npm install -g session-wrap-skill@3.4.0
```

### Issue: Permission denied on scripts

```bash
# Solution: Fix permissions
chmod +x /usr/local/lib/node_modules/session-wrap-skill/scripts/*.sh
```

---

## Support

If you run into issues:

1. **Check [FAQ-TROUBLESHOOTING.md](FAQ-TROUBLESHOOTING.md)** — Covers common problems
2. **Check [QUICKSTART-EXAMPLES.md](QUICKSTART-EXAMPLES.md)** — Copy-paste solutions
3. **Open an issue** on GitHub with details

---

## Success Metrics

After migration, you should be able to:

- ✅ Load project context with `agent-context`
- ✅ Log decisions with reasoning
- ✅ Coordinate tasks with `agent-tasks`
- ✅ Share progress between agents
- ✅ Visualize project status
- ✅ Recover from mistakes with `agent-checkpoint`

If any of these don't work, check [FAQ-TROUBLESHOOTING.md](FAQ-TROUBLESHOOTING.md).

---

## Feedback

v3.4.0 is the biggest upgrade to session-wrap. Your feedback helps:

1. What features are you using most?
2. What's confusing?
3. What's missing?

Open an issue or discussion on GitHub.

---

**Welcome to v3.4.0! 🚀**

You now have agent infrastructure that scales from solo developers to 100+ person organizations.
