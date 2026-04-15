---
name: session-wrap
version: 3.1.0
description: |
  Universal session wrap-up: automatically persist project context to memory files for seamless resume.
  Works with ANY AI agent — Claude Code, Codex, Gemini CLI, Cursor, Windsurf, Cline, Roo Code,
  Aider, Continue.dev, Copilot, Amp, OpenClaw, OpenHands, Amazon Q, Tabnine, Supermaven,
  Devin, bolt.new, and any future agent framework.
  Use when: user says "收工", "wrap up", "結束", "整理記憶", "resume準備", "保存上下文",
  "下次繼續", "先到這", "今天先這樣", "done for now", "save context", "end session",
  "今日はここまで", or any session-ending intent in any language.
  Also trigger proactively when a major milestone is reached and user seems done.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# Session Wrap v3 — Universal Agent Memory Persistence

Capture project state at session end so the next session resumes with full context. Works with **any AI agent** that can read files — coding agents, personal assistants, multi-channel bots.

**Problem**: AI agents lose all context between sessions. Users waste time re-explaining context.
**Solution**: Structured memory files that any agent auto-loads on next session start.

## Trigger Keywords

| Language | Keywords |
|----------|----------|
| 中文 | 收工、結束、整理記憶、先到這、今天先這樣、下次繼續、保存上下文、開新對話 |
| English | wrap up, done for now, save context, end session, call it a day, let's stop here |
| 日本語 | 終了、今日はここまで、保存して |
| 한국어 | 마무리, 오늘은 여기까지, 저장해줘 |

Also trigger proactively when: major milestone reached, user signals finality, or context window is filling up.

---

## Context Window Guardian

**This is a continuous monitoring behavior, not a one-time step.** Throughout the entire session, actively track context window usage and take action at defined thresholds.

### How to Estimate Context Usage

You don't have a precise token counter, but you can estimate based on observable signals:

| Signal | Estimation method |
|--------|------------------|
| **Conversation turns** | Count user messages + your responses. Average turn ≈ 500-2000 tokens. |
| **Tool call accumulation** | Each file read ≈ 1000-5000 tokens. Each large grep/glob result ≈ 500-3000 tokens. |
| **Code blocks generated** | Each code block ≈ 200-1000 tokens. |
| **Session duration** | Long sessions (30+ turns, 60+ tool calls) are likely past 50%. |
| **System compaction hints** | If you see `[compacted]` markers or system messages about compression, you're near the limit. |
| **Repeated context** | If you're re-reading files you already read earlier, context may have been pruned — you're deep. |

**Rough formula**: `estimated_usage = (user_turns × 800) + (tool_results × 1500) + (your_responses × 600)`

For reference, common context windows:
- Claude Code (Opus): ~200K tokens (1M with extended)
- Cursor: ~128K tokens
- Codex: ~128K tokens
- Gemini CLI: ~1M tokens
- Most others: ~64K-200K tokens

### Threshold Actions

| Context % | Action | What to do |
|-----------|--------|------------|
| **< 40%** | 🟢 Normal | Continue working. No action needed. |
| **40-50%** | 🟡 Awareness | Start mentally noting what's important this session. No action yet. |
| **~50%** | 🟠 **Checkpoint Save** | **Proactively execute a lightweight memory save.** Don't wait for user to say "收工". Announce: "上下文已過半，先存個記憶檢查點。" Then run Steps 1-8 (lightweight mode — skip maintenance, just save current state). |
| **50-70%** | 🟠 Active management | After checkpoint, continue working but be concise. Avoid re-reading files already in context. Prefer targeted reads over full-file reads. |
| **~75%** | 🔴 **Full Save + Alert** | Execute full session-wrap (including maintenance). Alert user: "上下文快滿了，建議開新對話繼續。記憶已保存。" |
| **> 80%** | 🔴 Critical | If still in session, every response should be minimal. Prioritize saving any unsaved work to memory before context is auto-compacted. |

### Checkpoint Save (Lightweight Mode)

When triggered at ~50%, do a fast save without full maintenance:

1. **Skip** memory compression, deduplication, staleness check (Step 5)
2. **Do** gather state (Step 2) → analyze (Step 3) → write (Step 4) → update index (Step 6)
3. **Mark** the checkpoint in memory with timestamp: `> Checkpoint: 2026-03-25 14:30 (mid-session save)`
4. **Continue working** — this is NOT a session end, just a safety save

### Full Save at ~75%

When triggered at ~75%, do the complete session-wrap:

1. Execute **all steps** (1-8) including maintenance
2. Summarize what's left to do (if any incomplete tasks)
3. Suggest user start a new session: "記憶已完整保存，建議開新對話繼續未完成的工作。"
4. If user continues, keep responses minimal and focused

### Context-Aware Behavior Throughout Session

Beyond threshold saves, adopt these habits as context grows:

**Early session (< 30%)**:
- Read files freely, explore broadly
- Detailed explanations are fine

**Mid session (30-60%)**:
- Prefer targeted reads (specific line ranges) over full files
- Consolidate tool calls — do multiple checks in one call
- Keep responses concise

**Late session (60%+)**:
- Only read what's absolutely necessary
- Reference previous reads by memory, don't re-read
- Short, action-oriented responses
- Proactively save any important findings to memory

### Platform-Specific Context Signals

| Platform | How to detect you're running out |
|----------|----------------------------------|
| **Claude Code** | System sends `<compacted>` message with conversation summary. If you see this, you've already been compressed — save immediately. |
| **Cursor** | Chat may slow down or truncate earlier messages. No explicit signal. |
| **Codex** | May start dropping early tool results from context. |
| **Gemini CLI** | Has 1M context — less urgent but still track for very long sessions. |
| **Cline/Roo** | VS Code may show token count in status bar. |

### What to Save at Each Threshold

| Threshold | Save scope |
|-----------|-----------|
| **50% checkpoint** | Current task progress, key decisions made, files modified, any gotchas discovered so far |
| **75% full save** | Everything from checkpoint + lessons learned + what's left to do + handoff notes for next session |
| **80%+ emergency** | Bare minimum: what was the goal, what's done, what's not done, any critical context that would be lost |

---

## Step 1: Detect Platform & Memory Path

### Platform Detection Table

| Platform | How to detect | Memory write path | Instructions file |
|----------|--------------|-------------------|-------------------|
| **Claude Code** | `~/.claude/` dir or CLAUDE_* env | `~/.claude/projects/<hash>/memory/` | `CLAUDE.md` (3 layers) |
| **Codex** (OpenAI) | AGENTS.md present or codex CLI | `.ai-memory/` | `AGENTS.md` |
| **Gemini CLI** | `~/.gemini/` dir or GEMINI.md | `.ai-memory/` | `GEMINI.md` (3 layers) |
| **Cursor** | `.cursor/` dir | `.cursor/memory/` | `.cursor/rules/*.mdc` |
| **Windsurf** | `.windsurf/` dir or `.windsurfrules` | Native Memories DB + `.ai-memory/` backup | `.windsurfrules` |
| **Cline** | `.cline/` dir or `.clinerules` | `.cline/memory/` | `.cline/rules/` |
| **Roo Code** | `.roo/` dir or `.roorules` | `.roo/memory/` | `.roo/rules/` |
| **Aider** | `.aider.conf.yml` | `.ai-memory/` | `.aider.conf.yml` |
| **Continue.dev** | `.continue/` dir | `.ai-memory/` | `.continuerules` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | `.ai-memory/` | `.github/copilot-instructions.md` |
| **Amp** | `AGENT.md` (Sourcegraph) | `.ai-memory/` | `AGENT.md` (3 layers) |
| **OpenClaw** | `~/.openclaw/` dir or `openclaw.json` | `~/.openclaw/workspace/memory/` | workspace `AGENTS.md` + `SOUL.md` |
| **OpenHands** | `.openhands/` dir or openhands env | `.ai-memory/` | `.openhands/config.toml` |
| **Amazon Q** | `.amazonq/` dir or Q env vars | `.ai-memory/` | `.amazonq/rules/` |
| **Tabnine** | `.tabnine/` dir | `.ai-memory/` | Tabnine IDE settings |
| **Supermaven** | `.supermaven/` dir | `.ai-memory/` | Supermaven IDE settings |
| **Devin** | Cloud environment | `.ai-memory/` in repo | Cloud Knowledge base |
| **bolt.new** | WebContainer environment | `.ai-memory/` | UI System Prompt |
| **Unknown** | None of above | `.ai-memory/` in project root | — |

**Detection order**: Check top-down, first match wins.
**Fallback**: `.ai-memory/` in project root — the universal convention.

### Cross-Platform Bootstrap

For agents WITHOUT native memory, append a boot directive to their instructions file:

```
# Auto-Memory (session-wrap)
On session start, read all .md files in .ai-memory/ directory for project context from previous sessions.
```

Only add once (check for `Auto-Memory (session-wrap)` marker first). **Do NOT modify** if running inside Claude Code or Windsurf (native memory).

---

## Step 2: Gather State

Run in parallel:

1. **Git state** (if git repo): `git log --oneline -15`, `git status --short`, `git branch --show-current`, `git remote -v`
2. **Existing memory files**: scan memory directory for update vs create decisions
3. **Project artifacts**: README, config files (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
4. **Non-git projects**: directory structure + file modification times

---

## Step 3: Analyze & Categorize

| Memory Type | What to capture | Examples |
|-------------|----------------|----------|
| **project** | Status, version, done/pending, repo, branch | "v2.1 released, auth refactor on feat/auth" |
| **feedback** | Lessons, gotchas, patterns | "Integration tests need real DB, not mocks" |
| **user** | Preferences, workflow style | "Prefers TDD, terse responses, uses vim" |
| **reference** | External URLs, tools, resources | "API docs at internal.company.com/api" |

**Rules**:
- **Update over create** — same topic → update existing file
- **Distill, don't dump** — extract signal, discard noise
- **Absolute dates** — "today" → "2026-03-25"
- **No ephemeral state** — no debug sessions, no temp paths
- **No code-derivable info** — architecture, API signatures belong in code
- **No git-trackable info** — commit history, diffs → use `git log`

---

## Step 4: Write Memory Files

Universal format (any agent can parse):

```markdown
---
name: {{descriptive name}}
description: {{one-line summary for relevance judgment}}
type: {{project|feedback|user|reference}}
updated: {{YYYY-MM-DD}}
expires: {{YYYY-MM-DD or "never"}}
platform: {{claude-code|codex|gemini|cursor|windsurf|cline|roo|openclaw|openhands|universal}}
---

{{content}}
```

**File naming**: `{type}_{topic}.md` (e.g., `project_myapp.md`, `feedback_testing.md`)

### Expiry Rules

| Memory type | Default expiry | Rationale |
|-------------|---------------|-----------|
| **project** | 30 days | Project status changes frequently |
| **feedback** | never | Lessons remain valid long-term |
| **user** | never | Preferences are stable |
| **reference** | 90 days | External resources may change |

When loading memories, check `expires` field. If past expiry date, flag as `[STALE]` in the index but don't auto-delete — let the user or next session-wrap decide.

---

## Step 5: Memory Maintenance

Before writing new memories, run maintenance on existing ones:

### 5a: Compression

If a memory file exceeds **50 lines**, compress it:
- Keep frontmatter unchanged
- Summarize content to essential facts (target: 20-30 lines)
- Move historical details to a `## History` section at the bottom (keep last 3 entries)
- Delete history entries older than 90 days

### 5b: Conflict Resolution

If new information contradicts an existing memory:
1. **Verify** — check git state or files to determine which is correct
2. **Update** — replace the outdated info with verified current state
3. **Annotate** — add a one-line `> Updated YYYY-MM-DD: reason for change` above the changed section

### 5c: Deduplication

If two memory files cover overlapping topics:
1. Merge into the more specific file
2. Delete the generic one
3. Update MEMORY.md index

### 5d: Staleness Check

For each existing memory with an `updated` date:
- If `updated` is > 30 days ago AND type is `project`: mark as `[STALE]` in index
- If `updated` is > 90 days ago AND type is `reference`: mark as `[STALE]` in index
- Stale memories are still loaded but flagged — the agent should verify before relying on them

---

## Step 6: Update Index

Write/update `MEMORY.md`:

```markdown
# Memory Index

## Project
- [Topic](filename.md) — one-line description
- [Topic](filename.md) — one-line description [STALE]

## Feedback
- [Topic](filename.md) — one-line description

## User
- [Topic](filename.md) — one-line description

## Reference
- [Topic](filename.md) — one-line description
```

Keep under 200 lines. Organized by type. Mark stale entries.

---

## Step 7: Ensure Next-Session Bootstrap

For agents without native memory, check and append boot directive:

| Agent | File to modify | Directive |
|-------|---------------|-----------|
| Codex | `AGENTS.md` | `# Auto-Memory (session-wrap)\nOn start, read .ai-memory/*.md for prior context.` |
| Gemini CLI | `GEMINI.md` | Same |
| Amp | `AGENT.md` | Same |
| Copilot | `.github/copilot-instructions.md` | Same |
| Aider | `.aider.conf.yml` | Add `read:` entries |
| Cursor | `.cursor/rules/memory.mdc` | Create memory-loading rule |
| Continue | `.continuerules` | Same as AGENTS.md |
| OpenClaw | workspace `AGENTS.md` | `# Auto-Memory\nOn start, read memory/*.md in workspace.` |
| OpenHands | `.openhands/config.toml` | Add memory dir to context |
| Amazon Q | `.amazonq/rules/memory.md` | Create memory-loading rule |

**Skip** for Claude Code (native memory) and Windsurf (native Memories DB).

---

## Step 8: Confirm

Report with summary table:

```
記憶已更新：

| 檔案 | 動作 | 內容 |
|------|------|------|
| project_myapp.md | 更新 | v2.1 完成，auth 重構進行中 |
| feedback_testing.md | 新增 | 整合測試用 real DB |
| reference_apis.md | 壓縮 | 58→25 行，移除過期歷史 |

維護: 壓縮 1 檔 | 過期 0 檔 | 合併 0 檔
平台: Codex | 記憶路徑: .ai-memory/
下次開新對話會自動載入這些上下文。
```

---

## Anti-patterns

- **Don't dump the entire session** — distill to what matters for future sessions
- **Don't persist what git tracks** — commit history, file contents, diffs
- **Don't persist task lists** — session-scoped only
- **Don't persist code snippets** — they go stale, point to file + line
- **Don't create memory for trivial sessions** — say "本次沒有需要持久化的新資訊" and skip
- **Don't over-categorize** — 3-5 memory files is typical, 10+ is too many
- **Don't break existing instructions files** — append, don't overwrite
- **Don't store secrets** — no passwords, API keys, tokens

## Edge Cases

| Case | Handling |
|------|---------|
| No git repo | Skip git gathering, use directory listing + file mtimes |
| First session ever | Create all files, briefly explain the system to user |
| Nothing to save | Tell user "本次 session 沒有需要持久化的新資訊" |
| Conflicting memories | Verify → update → annotate change reason |
| Multiple projects | Each project gets its own memory directory |
| Cloud-only agent | Write `.ai-memory/` in repo, agent syncs on next run |
| Agent can't write files | Output memory as text, ask user to save manually |
| Memory file > 50 lines | Compress: summarize, keep last 3 history entries |
| Expired memory | Mark [STALE] in index, don't auto-delete |
| Duplicate memories | Merge into more specific file, delete generic one |
| Context auto-compacted | System compressed history — immediately save all important context to memory before more is lost |
| User ignores 75% alert | Continue working but save on every significant milestone. Don't nag repeatedly. |
| Very long session (100+ turns) | Likely past 50% on most platforms. Trigger checkpoint if not already done. |
