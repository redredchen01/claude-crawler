# Changelog

## v2.4.0 (2026-03-27)
- **`ctx setup`**: One command does install + init + hook
- **`ctx reset`**: Archive session to history.json, start fresh
- **`ctx history`**: Cross-session analytics with cumulative stats

## v2.3.0 (2026-03-27)
- Hook auto-creates checkpoint at 🟠 (60%) and emergency save at 🔴 (80%)
- CLI `ctx status` reads state.json with visual progress bar
- Dogfood verified end-to-end

## v2.2.0 (2026-03-27)
- **`ctx init`**: Create .ctx/ with state.json + .gitignore
- **`ctx hook`**: Install auto-tracking hook
- README fully rewritten for v2 architecture

## v2.1.0 (2026-03-27)
- **Auto-tracking hook**: afterToolUse hook runs after every tool call
- Zero manual overhead — AI doesn't need to manage state
- Hook tracks reads, writes, bash calls, dups, tokens

## v2.0.0 (2026-03-27)
- **Architecture upgrade**: state.json disk persistence
- `.ctx/status.md` human-readable dashboard
- `scripts/ctx_status.py` terminal status viewer
- `scripts/ctx_checkpoint.py` manual checkpoint creation

## v1.0.0 (2026-03-27)
- Complete Context OS: 10 modules
- MemoryLoader: progressive memory loading
- SessionManager: cross-session resume

## v0.5.0 (2026-03-27)
- TaskPlanner: estimate token budget before multi-file tasks
- CompactionGuard: detect compaction, emergency save
- ToolOptimizer: detect wasteful patterns

## v0.4.0 (2026-03-27)
- FileReadTracker: deduplicate file reads, save ~30% tokens
- Response budget per threshold

## v0.3.0 (2026-03-27)
- Initial release: ContextEstimator, PlatformDetector, CheckpointManager
- SKILL.md lite (<2KB) and full versions
- CLI installer with multi-platform detection
- 72 tests
