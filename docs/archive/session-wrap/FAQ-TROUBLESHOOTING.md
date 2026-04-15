# FAQ & Troubleshooting

Common questions and solutions for session-wrap v3.4.0.

---

## Installation & Setup

### Q: I installed via npm, but aliases don't work

**A:** You need to source the `.zshrc-wrap` file. After installing:

```bash
# Find where it was installed
which session-wrap-skill
# /usr/local/lib/node_modules/session-wrap-skill

# Add to ~/.zshrc
echo "source /usr/local/lib/node_modules/session-wrap-skill/.zshrc-wrap" >> ~/.zshrc

# Then reload shell
source ~/.zshrc
```

### Q: `agent-context: command not found`

**A:** The `.zshrc-wrap` file is not sourced. Add to `~/.zshrc`:

```bash
source ~/.zshrc-wrap
```

Then reload your shell:
```bash
exec zsh
```

### Q: I'm on Windows/WSL, aliases don't work

**A:** session-wrap is designed for macOS/Linux. On WSL:

1. Make sure you have bash/zsh installed
2. Ensure git is available: `git --version`
3. The `.zshrc-wrap` file configures aliases, so it only works in zsh/bash shells

For Windows (native), consider:
- Using WSL2 (recommended)
- Running in Git Bash
- Or contact maintainer for Windows port

### Q: Where are my session files saved?

**A:** They're saved in your memory directory (usually):

```bash
echo $YD_MEMORY
# /Users/dex/.claude/projects/-Users-dex-YD-2026/memory

# Or manually:
ls ~/.claude/projects/*/memory/session_*.md
```

---

## Agent Tools

### Q: My agent-context is empty

**A:** You haven't set any knowledge yet. Initialize your project:

```bash
agent-knowledge set conventions << 'EOF'
# My Project Conventions
- TypeScript strict mode
- 80% test coverage
EOF

agent-context
# Should now show your conventions
```

### Q: agent-tasks claim doesn't work

**A:** Make sure the task exists first:

```bash
# Create task
agent-tasks add my-task "Do something"

# Then claim it
agent-tasks claim my-task codex
```

If task doesn't exist:
```bash
agent-tasks list
# Shows all available tasks
```

### Q: agent-share read returns nothing

**A:** The agent state file doesn't exist. Another agent needs to write first:

```bash
# Agent A writes state
agent-share write agent-a ~/progress.md

# Agent B reads it (in a different session)
agent-share read agent-a
```

### Q: How do I list all decisions?

**A:** Use `agent-decision list`:

```bash
agent-decision list
# Shows last 10 decisions

# Or search
agent-decision search "caching"
# Shows all decisions mentioning "caching"
```

### Q: I made a mistake and want to restore an old checkpoint

**A:** Use `agent-checkpoint restore`:

```bash
# See all checkpoints
agent-checkpoint list

# Restore one
agent-checkpoint restore 20260326-143000

# You'll be back to that state
```

---

## Memory & Performance

### Q: My memory directory is getting too large

**A:** Use `agent-optimize` to clean up:

```bash
# See breakdown
agent-optimize stats

# Archive old sessions (keeps last 3)
agent-optimize archive

# Remove empty files
agent-optimize prune

# Check what would be deleted
agent-optimize prune --dry-run
```

### Q: How much memory does session-wrap use?

**A:** Typically 500KB - 5MB per project, depending on:
- Number of sessions (1 per session)
- Number of decisions (usually < 1MB total)
- Project size

Check with:
```bash
memory-report
```

### Q: Sessions are being saved multiple times per day (bloat)

**A:** By default, `wrap` creates one session per call. If you call it frequently:

```bash
# This creates a new session each time
wrap "checkpoint"

# Instead, call it once per real session
wrap "finished feature X"
```

Or let `agent-optimize` clean up:
```bash
agent-optimize archive  # Keeps last 3 sessions
```

### Q: Can I limit session memory?

**A:** Set environment variable to auto-archive:

```bash
export SESSION_WRAP_MAX_SIZE=10000000  # 10MB max
# Sessions older than retention_days auto-archived

export SESSION_WRAP_RETENTION_DAYS=7   # Keep last 7 days
```

---

## Multi-Agent Coordination

### Q: Two agents claimed the same task

**A:** Use `agent-tasks claim` to prevent this:

```bash
# Agent A
agent-tasks claim my-task agent-a
# ✅ Claimed successfully

# Agent B (tries to claim same task)
agent-tasks claim my-task agent-b
# ❌ Error: Already claimed by agent-a
```

Once task is done:
```bash
# Agent A
agent-tasks done my-task
# Now available for others
```

### Q: Agent B can't see Agent A's progress

**A:** Agent A needs to publish it with `agent-share`:

```bash
# Agent A (publishes state)
agent-share write agent-a ~/my-progress.md

# Agent B (in same session, different shell)
agent-share read agent-a
# Shows Agent A's progress
```

### Q: How do agents know what to work on?

**A:** Use `agent-tasks next`:

```bash
agent-tasks next
# Shows tasks that are:
# - Not yet claimed
# - All dependencies completed
```

Example output:
```
Available tasks:
✅ database-migration (completed)
⏳ api-implementation (in progress, claimed by agent-a)
⭐ frontend-ui (ready! all deps done)
❌ testing (blocked on: frontend-ui)
```

### Q: How do I coordinate across different projects?

**A:** Create a meta-workspace:

```bash
cd ~/workspace
agent-knowledge set project-sync << 'EOF'
# Current Projects Status
- Project A: API complete, frontend waiting
- Project B: In planning phase
- Project C: On hold
EOF

# Use shared decisions
agent-decision log "api-design" "REST with JSON responses"

# Other projects reference
cd ~/workspace/project-b
agent-decision search "api-design"
# Finds decision from Project A
```

---

## Decision Logging

### Q: How detailed should decisions be?

**A:** Balance between complete and concise. Example:

```bash
# Too vague
agent-decision log "auth" "use JWT"

# Better
agent-decision log "auth" "implement JWT with 15min access + 7day refresh" << 'EOF'
Requirement: stateless auth for distributed services
Options: Session (stateful), JWT (stateless), OAuth (third-party)
Decision: JWT (stateless, scales well)
Trade-off: Need token refresh mechanism (complexity)
Implementation: 15min access token, 7day refresh token
Review: Revisit quarterly based on security needs
EOF
```

### Q: I want to search decisions but can't find it

**A:** Search is case-insensitive and searches reasoning too:

```bash
# These all find the auth decision
agent-decision search "auth"
agent-decision search "JWT"
agent-decision search "stateless"

# If still not found, check the file directly
ls ~/.claude/projects/*/memory/decisions/
```

### Q: Can I edit a decision after logging?

**A:** Not directly (immutable by design), but you can:

1. Log a follow-up decision
```bash
agent-decision log "auth-update" "Extend refresh token to 14 days" << 'EOF'
Previous decision: 7-day refresh token
Update: Changed to 14 days after user feedback
EOF
```

2. Or modify the decision file directly (if needed):
```bash
# Find the file
ls ~/.claude/projects/*/memory/decisions/
# Edit it manually (not recommended)
```

---

## Visualization Tools

### Q: visualize-tasks shows no progress

**A:** You haven't created any tasks yet. Initialize:

```bash
agent-tasks add task1 "First task"
agent-tasks add task2 "Second task" "task1"

visualize-tasks
# Should now show task graph
```

### Q: analyze-decisions shows 0 decisions

**A:** You haven't logged any decisions. Log one:

```bash
agent-decision log "architecture" "use microservices"

analyze-decisions
# Should now show 1 decision
```

### Q: memory-report shows huge memory usage

**A:** Check breakdown:

```bash
memory-report
# Shows: sessions (500KB), checkpoints (300KB), etc.

# Archive old sessions
agent-optimize archive

# Check again
memory-report
```

### Q: timeline shows no velocity

**A:** You need at least 3 sessions to calculate velocity:

```bash
# Make some progress
agent-tasks add task1 "Something"
agent-tasks done task1
wrap "Session 1"

# Do more work
wrap "Session 2"
wrap "Session 3"

# Now timeline will show velocity
timeline
```

---

## Integration Issues

### Q: Claude Code hook doesn't save session

**A:** Check the hook configuration:

1. Open `~/.claude/settings.json`
2. Verify PostToolUse hook is set:
```json
{
  "hooks": {
    "postToolUse": {
      "type": "command",
      "command": "bash /path/to/session-wrap.sh"
    }
  }
}
```

3. Test manually:
```bash
bash /path/to/scripts/session-wrap.sh
# Should succeed without errors
```

### Q: Cursor/Windsurf can't find agent-context

**A:** Make sure `.zshrc-wrap` is sourced in the agent's environment:

```bash
# In your agent startup script
source ~/.zshrc-wrap
agent-context
```

Or use full path:
```bash
bash /path/to/scripts/agent-context.sh
```

### Q: Obsidian sync doesn't work

**A:** Check Obsidian vault location:

```bash
# Should be set to your vault
echo $YD_OBSIDIAN

# If not set, configure
export YD_OBSIDIAN="/path/to/obsidian/vault"
```

Then sync manually:
```bash
sync-kb
# Should sync files to Obsidian
```

---

## Common Errors

### Error: `mkdir: cannot create directory`

**A:** Permission issue. Check if memory directory exists:

```bash
ls -la ~/.claude/projects/*/memory/

# If permission denied, fix it
chmod 755 ~/.claude/projects/*/memory/
```

### Error: `jq: command not found`

**A:** `jq` is required for JSON parsing. Install it:

```bash
# macOS
brew install jq

# Ubuntu
sudo apt-get install jq

# Then test
jq --version
```

### Error: `git: not a git repository`

**A:** Your project directory is not a git repo. Initialize it:

```bash
cd /your/project
git init
git add .
git commit -m "initial"
```

### Error: Task JSON corrupted

**A:** The `tasks.json` file got corrupted. Fix it:

```bash
# See the file
cat ~/.claude/projects/*/memory/tasks/tasks.json

# If invalid JSON, restore from backup
# Or create new one
echo '{"tasks": {}}' > ~/.claude/projects/*/memory/tasks/tasks.json
```

### Error: Too many open files

**A:** File descriptor limit reached. Check and increase:

```bash
# See current limit
ulimit -n

# Increase (temporary)
ulimit -n 4096

# Permanent (add to ~/.zshrc)
echo "ulimit -n 4096" >> ~/.zshrc
```

---

## Performance Issues

### Q: agent-context is slow

**A:** It's reading from disk. First run in a session is slower. After that, it's cached.

If consistently slow:
```bash
# Check file size
du -h ~/.claude/projects/*/memory/

# Archive old sessions
agent-optimize archive
```

### Q: visualize-tasks takes 10+ seconds

**A:** You have a large task graph. This is normal. To speed up:

```bash
# Only show recent tasks
agent-tasks status | head -20
```

### Q: wrap command takes too long

**A:** It's writing to disk and running git operations. Normal for large repos.

To optimize:
```bash
# Archive old sessions first
agent-optimize archive

# Then wrap
wrap "quick session"
```

---

## Data Safety

### Q: Can I backup my session data?

**A:** Yes! It's all in the memory directory:

```bash
# Backup
cp -r ~/.claude/projects/*/memory/ ~/backups/session-wrap-backup-$(date +%Y%m%d)

# Restore
cp -r ~/backups/session-wrap-backup-20260326/memory/ ~/.claude/projects/*/
```

### Q: I accidentally deleted a decision, can I recover it?

**A:** Yes, if you have git history:

```bash
# If decisions are in git
git log -- decisions/
git show <commit>:decisions/your-decision.md

# Otherwise, check your backup
ls ~/backups/session-wrap-backup-*
```

### Q: Is my session data encrypted?

**A:** No. It's stored as plain text in `~/.claude/projects/*/memory/`.

For sensitive projects:
```bash
# Encrypt the directory
gpg --recursive --encrypt ~/.claude/projects/*/memory/

# Or use encrypted filesystem
# Follow your OS instructions for encrypted volumes
```

### Q: What happens if I delete the memory directory?

**A:** All sessions, decisions, and tasks are lost. To recover:

1. If you have a backup: restore it
2. If not: that data is gone
3. Your git commits are still there (session wraps get committed)

**Prevention:**
```bash
# Commit memory to git
git add -A
git commit -m "session wrap"
git push

# Now it's backed up on GitHub/remote
```

---

## Best Practices

### Q: How often should I call `wrap`?

**A:** Once per distinct session/work block. Examples:

```bash
# Good: One feature per session
wrap "Implemented login form validation"

# Good: End of day, even if incomplete
wrap "Day's work: 60% on checkout, waiting for API"

# Not necessary: Every few minutes
# Not recommended: Never (you'll lose context)
```

### Q: Should I commit decision logs to git?

**A:** Yes! Add to `.gitignore` ONLY if you have sensitive decisions:

```bash
# Track everything else
git add -A
git commit -m "session: completed feature X"

# If memory contains secrets, exclude:
echo ".claude/" >> .gitignore  # Don't commit memory
```

### Q: How do I know if an agent has finished?

**A:** Check three things:

```bash
# 1. See if task is done
agent-tasks status | grep my-task

# 2. Check last session
agent-share read agent-name

# 3. Check task status directly
visualize-tasks
```

### Q: Should I use checkpoints for everything?

**A:** No. Use checkpoints for:
- Before risky changes
- Before major refactors
- Before deployments
- Exploratory work

Don't use for:
- Every 5 minutes (overkill)
- Trivial changes
- Just committing to git is enough

---

## Getting Help

### Q: I found a bug, how do I report it?

**A:** Create an issue on GitHub:

1. Go to https://github.com/redredchen01/session-wrap-skill/issues
2. Click "New issue"
3. Include:
   - What you were doing
   - Expected behavior
   - Actual behavior
   - Version: `npm list -g session-wrap-skill`
   - OS: `uname -a`

### Q: I have a feature request

**A:** Open a discussion on GitHub:

1. Go to GitHub repo
2. Click "Discussions"
3. Describe your use case and desired behavior

### Q: I want to contribute

**A:** See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Quick start:
1. Fork the repo
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes
4. Run tests: `bash scripts/test-agent-tools.sh`
5. Push and create PR

---

## Still Stuck?

If none of these answers help:

1. **Check the docs:**
   - [QUICKSTART-EXAMPLES.md](QUICKSTART-EXAMPLES.md) — Copy-paste examples
   - [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) — Common patterns
   - [Real-world guides](README.md#real-world-workflow-guides) — Your scenario

2. **Check the code:**
   - Scripts are well-commented: `cat scripts/agent-context.sh`
   - See examples: `ls examples/`

3. **Try debug mode:**
   ```bash
   # Add -x for bash debug output
   bash -x scripts/agent-context.sh
   ```

4. **Search existing issues:**
   - GitHub Issues: https://github.com/redredchen01/session-wrap-skill/issues

5. **Create a new issue** with details above

---

**Last updated:** 2026-03-26 | **v3.4.0**
