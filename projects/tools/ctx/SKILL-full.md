---
name: ctx-full
version: 2.6.0
description: |
  Extended context window manager with detailed estimation, multi-platform support,
  memory health scoring, and integration with session-wrap.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# ctx (Full) — Context Window Manager

Extended version with detailed behaviors for each threshold stage.

## Core: Same as SKILL.md

See SKILL.md for thresholds, estimation, and checkpoint format.

## Extended Estimation Model

### Token Ratios

| Event | Tokens |
|-------|--------|
| 1 char user message | ~0.3 tokens |
| 1 char assistant response | ~0.25 tokens |
| 1 line file read | ~15 tokens |
| 1 char tool result | ~0.3 tokens |

### Compound Signals

| Signal | Meaning |
|--------|---------|
| 30+ user turns | Likely past 40% |
| 60+ tool calls | Likely past 50% |
| Re-reading files | Earlier context pruned, past 60% |
| `[compacted]` message | System compressed history, save immediately |

## Stage Behaviors

### 🟢 Green (< 40%)
- Read files freely, explore broadly
- Detailed explanations OK
- No status needed unless user asks

### 🟡 Yellow (40-60%)
- Show status line every 3 tool calls
- Use `offset` + `limit` for file reads instead of full reads
- Combine related tool calls
- Keep responses concise

### 🟠 Orange (60-80%)
- Auto-checkpoint: write `.ctx/checkpoints/` file with:
  - Current task summary
  - Key files modified
  - Decisions made
  - What's left to do
- Alert: "Context at ~65%, checkpoint saved. Continuing."
- Only read what's absolutely needed
- Reference memory instead of re-reading

### 🔴 Red (> 80%)
- Full save: dump ALL important context
  - Task state → checkpoint file
  - Lessons learned → memory file
  - Incomplete work → TODO in checkpoint
- Alert: "Context at ~85%. Recommend starting new session. All progress saved."
- Minimal responses only
- If session-wrap is installed, trigger it

## Memory Health Score

After checkpoint, show health:

```
Memory health: 8/10 [████████░░]
  Files: 4 | Stale: 0 | Needs compression: 1
```

Scoring:
- Base: 10
- >10 files: -3 | >7: -2 | >5: -1 | 0 files: -2
- Each stale file: -1 (max -3)
- Each needs-compression: -1 (max -2)
- Last updated >14d: -2 | >7d: -1

## Session-Wrap Integration

When session-wrap skill is available:
- At 🟠: trigger session-wrap checkpoint (lightweight)
- At 🔴: trigger full session-wrap
- Share checkpoint data via `.ctx/checkpoints/`

When not available:
- Write standalone checkpoints
- Add bootstrap note to agent instructions file

## Cross-Session Resume

On session start, if `.ctx/checkpoints/` exists:
1. Read the latest checkpoint
2. Show: "Resuming from checkpoint at X%. Last session: [summary]"
3. Continue from where you left off

## Platform-Specific Notes

### OpenClaw
- Check `~/.openclaw/` for workspace config
- Memory in workspace `memory/` directory
- Supports AGENTS.md + SOUL.md bootstrap

### Claude Code
- Native memory in `~/.claude/projects/*/memory/`
- Detects `[compacted]` system messages
- Works alongside auto-memory (complementary)

### Cursor
- Smaller context (128K) — thresholds shift down:
  - Yellow at 30%, Orange at 50%, Red at 70%
- Rules in `.cursor/rules/ctx.mdc`

### Cline / Kilo Code
- User provides own API key — context varies
- Default assume 200K, adjust if known
