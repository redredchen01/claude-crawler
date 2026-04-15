# Agent Integrations Guide

Integrate session-wrap with Claude Code, Cursor, Windsurf, Cline, and other AI agents.

## Overview

### Why Integrate?

**Without Integration:**
```
Agent work → Manual: wrap
           → No context auto-load
           → Slow context recovery
```

**With Integration:**
```
Agent work → Auto: agent-context
           → Auto: wrap on end
           → No manual steps needed
```

---

## Claude Code

### Integration: PostToolUse Hook

Claude Code runs hooks after each tool execution. Use this to auto-sync.

#### Setup

1. **Locate Claude Code settings:**
   - Mac: `~/.claude/settings.json`
   - Windows: `%APPDATA%\Claude\settings.json`
   - Linux: `~/.config/Claude/settings.json`

2. **Add PostToolUse hook:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "cd ~/YD\\ 2026 && bash scripts/session-wrap.sh 'Auto-sync from Claude Code'",
        "statusMessage": "💾 Saving session context...",
        "runOn": "completion"
      }
    ]
  }
}
```

#### Verification

```bash
# After running a tool in Claude Code, should see:
# 💾 Saving session context...
# ✅ Wrap file: .../session_20260326_wrap.md
```

### Integration: Auto-Context on Startup

Create a Claude Code hook that runs at session start:

```json
{
  "hooks": {
    "OnSessionStart": [
      {
        "type": "command",
        "command": "cd ~/YD\\ 2026 && bash scripts/agent-context.sh",
        "statusMessage": "🧠 Loading project context..."
      }
    ]
  }
}
```

---

## Cursor

### Setup

Cursor uses `.cursorrules` for custom instructions. Add session-wrap context:

**File: `.cursorrules`** (in project root)

```markdown
# Session Wrap Integration

You are an AI assistant helping with development. At the start of each session:

1. Load project context:
   - Run: agent-context
   - Review recent decisions: agent-decision list
   - Check next tasks: agent-tasks next
   - Understand conventions: agent-knowledge get conventions

2. During work:
   - Log important decisions: agent-decision log <topic> <decision> <reasoning>
   - Claim tasks: agent-tasks claim <task-id>
   - Save checkpoints: agent-checkpoint save

3. At session end:
   - Run: wrap "Your summary here"
   - Update tasks: agent-tasks done <task-id>

Example flow:
- Start: agent-context
- Work...
- Log: agent-decision log "auth" "use JWT" "stateless, scales well"
- End: wrap "Implemented auth system"
```

### Cursor Commands

Add to Cursor's command palette:

```bash
# Save session
Cmd+Shift+P → Tasks: Session Wrap → wrap

# Load context
Cmd+Shift+P → Tasks: Load Context → agent-context

# Check tasks
Cmd+Shift+P → Tasks: Show Next → agent-tasks next
```

---

## Windsurf

### Setup

Similar to Cursor, use Windsurf's instruction files:

**File: `.windsurf/instructions.md`**

```markdown
# Session Wrap for Windsurf

Before starting work:
1. Load context: agent-context
2. Check tasks: agent-tasks next

During development:
- Claim task: agent-tasks claim <task-id>
- Log decisions: agent-decision log <topic> <decision> <reasoning>

After finishing:
- Mark task done: agent-tasks done <task-id>
- Save session: wrap "What you completed"
```

---

## Cline

### Setup

Cline allows custom system prompts. Add to your Cline instructions:

```
You are working with session-wrap-skill for context management.

At session start:
1. Run: agent-context
2. Check: agent-tasks next
3. Review: agent-decision list

During work:
- When making decisions, log them: agent-decision log <topic> <decision> <reasoning>
- Track progress in tasks system
- Save checkpoints before risky changes: agent-checkpoint save

At session end:
- Run: wrap "Summary of what was done"
- Update task status: agent-tasks done <task-id>

Tools available:
- agent-context: Load project context
- agent-decision: Log and review decisions
- agent-tasks: Manage task dependencies
- agent-checkpoint: Create and restore checkpoints
- agent-knowledge: Manage project knowledge
- agent-share: Share state between agents
- agent-optimize: Optimize memory
- wrap: Save session
```

---

## Continue.dev

### Setup

Continue uses `~/.continue/config.json`:

```json
{
  "models": [...],
  "system_prompt": "You have access to session-wrap tools. Use 'agent-context' to load context and 'wrap' to save sessions.",
  "slash_commands": [
    {
      "name": "context",
      "description": "Load session context",
      "run": "bash scripts/agent-context.sh"
    },
    {
      "name": "wrap",
      "description": "Save session",
      "run": "bash scripts/session-wrap.sh"
    }
  ]
}
```

Usage in Continue:
```
/context          → Load project context
/wrap             → Save session
```

---

## Generic Agent (Custom/Manual)

### Shell Integration

For any agent or IDE:

```bash
# At session start
source ~/.zshrc-wrap
agent-context              # Load context
agent-tasks next          # Show what to do

# During work (manual calls)
agent-decision log "feature" "chose X" "reason Y"
agent-checkpoint save "checkpoint name"

# At session end
wrap "What was accomplished"
agent-tasks done "task-id"
```

### Environment Setup

Add to `.bashrc` or `.zshrc`:

```bash
# Session Wrap Setup
export SESSION_WRAP_API_URL="http://localhost:3000"  # or production URL
export YD_WORKSPACE="/path/to/YD 2026"
export YD_MEMORY="/path/to/memory"

# Auto-load aliases
[ -f "$YD_WORKSPACE/.zshrc-wrap" ] && source "$YD_WORKSPACE/.zshrc-wrap"
```

---

## Multi-Agent Coordination

### Cross-Agent Communication

When multiple agents work on the same project:

**Agent A (End of session):**
```bash
wrap "Feature A completed"
agent-share write agent-a ~/agent-a-state.md
agent-tasks done "feature-a"
```

**Agent B (Start of session):**
```bash
agent-context                    # Load shared context
agent-share read agent-a         # See what A did
agent-tasks next                 # Show available tasks
# → Can see "feature-a" is done, ready to start next task
```

### Task Handoff Pattern

```bash
# Agent A: Complete task, pass to B
agent-tasks done "backend-api"
agent-share write agent-a ~/api-design.md
wrap "Backend API ready for frontend"

# Agent B: Pick up next task
agent-share read agent-a         # See API design
agent-tasks claim "frontend-ui" "agent-b"
agent-tasks next                 # Verify "backend-api" is done ✓
# → Can proceed knowing API is ready
```

---

## Real-World Integration Examples

### Example 1: Claude Code + Decision Logging

Claude Code + session-wrap with decision tracking:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "bash -c 'if [ $? -eq 0 ]; then cd ~/YD\\ 2026 && echo \"Tool succeeded\"; fi'",
        "statusMessage": "Checking state..."
      }
    ]
  }
}
```

Then manually:
```bash
# After Claude Code completes work
agent-decision log "api-design" "REST with nested routes" \
  "simpler than GraphQL, perfect for MVP"
wrap "API design completed per Claude Code"
```

### Example 2: Multi-Editor Hybrid

Using Claude Code + Cursor on same project:

```bash
# Machine 1 (Claude Code)
export SESSION_WRAP_API_URL="https://api.production.com"
agent-context
# ... work ...
wrap "Feature X backend"
agent-share write claude-code ~/backend-done.md

# Machine 2 (Cursor)
export SESSION_WRAP_API_URL="https://api.production.com"
agent-context
agent-share read claude-code   # See what was done
agent-tasks next               # Show next available
# ... work on frontend ...
wrap "Feature X frontend"
```

### Example 3: Team of Agents (3 agents on 1 project)

**Day 1: Agent Codex (Backend)**
```bash
source ~/.zshrc-wrap
agent-context
agent-tasks claim "db-schema"
# ... work ...
agent-tasks done "db-schema"
agent-share write codex ~/db-done.md
wrap "Database schema ready"
```

**Day 2: Agent Cursor (API)**
```bash
source ~/.zshrc-wrap
agent-context
agent-share read codex        # See database schema
agent-tasks claim "api"
# ... work ...
agent-tasks done "api"
agent-share write cursor ~/api-done.md
wrap "API endpoints ready"
```

**Day 3: Agent Windsurf (Frontend)**
```bash
source ~/.zshrc-wrap
agent-context
agent-share read codex        # Database
agent-share read cursor       # API design
agent-tasks claim "frontend"
# ... work ...
agent-tasks done "frontend"
wrap "Frontend complete"
```

---

## Best Practices

✅ **DO:**
- Integrate at session start (load context)
- Auto-save at session end (wrap)
- Log decisions before implementing
- Share progress with other agents
- Check agent-tasks next before starting
- Update task status when done

❌ **DON'T:**
- Skip context loading (wastes time)
- Make decisions without logging
- Forget to update task status
- Ignore agent-share from other agents
- Let memory grow unbounded
- Work on same task as another agent

---

## Troubleshooting Integrations

### Hook not running in Claude Code
→ Check settings.json syntax
→ Verify command path is absolute
→ Test command manually first

### agent-context is empty
→ No decisions logged yet (expected on first run)
→ Check memory directory exists

### wrap not saving to cloud
→ Check SESSION_WRAP_API_URL is set
→ Verify backend is running: `wrap status`
→ Check network connectivity

### agent-share read returns nothing
→ Other agent hasn't published state yet
→ Check agent-share list shows other agents
→ Verify shared memory directory permissions

---

## Getting Help

If integrations aren't working:

1. **Test locally first:**
   ```bash
   bash scripts/agent-context.sh    # Should print context
   agent-tasks add test "Test"      # Should work
   wrap "Test wrap"                 # Should create file
   ```

2. **Check environment variables:**
   ```bash
   echo $YD_WORKSPACE
   echo $SESSION_WRAP_API_URL
   ```

3. **Review logs:**
   ```bash
   tail -20 ~/.zshrc-wrap
   cat ~/.session-wrap/token        # JWT token
   ```

4. **Report issue:**
   - GitHub: https://github.com/redredchen01/session-wrap-skill/issues
   - Include: OS, editor, exact error message, commands run

---

**Integrations make session-wrap truly powerful. Start with your preferred editor, then expand to multi-agent workflows!** 🚀
