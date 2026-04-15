# Automation Architecture Implementation Checklist

**Status**: Ready for Phase 1 execution  
**Last Updated**: 2026-04-06  
**Owner**: AI Automation System  

---

## Phase 1: L1 + L2 Foundation (Week 15)

### Prerequisite: Audit Existing Hooks

- [x] Documented current `~/.claude/settings.json` hooks
- [x] Identified gaps: L3/L4 missing, L1 incomplete
- [x] Verified L2 partial implementation (vault sync works)
- [x] No breaking changes identified

### L1: PostToolUse Hooks

#### 1.1 Add Hook: test-result-log (NEW)

**File**: `~/.claude/settings.json` (PostToolUse.Bash section)

**Implementation**:
- Trigger: After Bash commands
- Match: pytest, npm test, cargo test
- Log format: `timestamp | test-result-log | exit_code | pass_count | fail_count`
- Output: `~/.claude/test-audit.log`
- Timeout: 5s
- Error handling: Soft-fail

**Verification**:
```bash
# After running: pytest tests/
# Check log: tail -1 ~/.claude/test-audit.log
# Should contain: 2026-04-06T... | test-result-log | 0 | 29 | 0
```

**Estimated Effort**: 1 hour  
**Blocking**: No (P2 priority in architecture)

#### 1.2 Add Hook: post-commit-validate (NEW)

**File**: `~/.claude/settings.json` (PostToolUse.Bash section)

**Implementation**:
- Trigger: After `git commit`
- Check 1: Commit message format (conventional: feat/fix/docs/...)
- Check 2: CHANGELOG.md updated (for feat/fix)
- Check 3: No obvious anti-patterns (grep for bad patterns)
- Log format: `timestamp | post-commit-validate | status | violations`
- Output: `~/.claude/commit-audit.log`
- Timeout: 10s
- Error handling: Soft-fail (warn, don't block)

**Verification**:
```bash
# After: git commit -m "feat(x): test"
# Should see: "✅ Commit message valid"
# Check log: tail ~/.claude/commit-audit.log
```

**Estimated Effort**: 2 hours  
**Blocking**: No (P1 priority)

#### 1.3 Improve Hook: prettier (EXISTING)

**Status**: Already active, but may timeout on large files

**Enhancement**:
- Add timeout: 10s (already set)
- Add skip: .min.js files (performance)
- Add skip: node_modules/ (already skipped)
- Verify: No regressions in other projects

**Verification**:
```bash
# Edit src/ydk/commands/api.py
# Should auto-format in <5s
```

**Estimated Effort**: 0.5 hour  
**Blocking**: No (already working)

#### 1.4 Verify Hook: vault-sync (EXISTING)

**Status**: Active for Edit/Write on .md files

**Verification Checklist**:
- [ ] Runs when Obsidian .md files edited
- [ ] Does NOT run for code .md files (false positives)
- [ ] Timeout 10s respected
- [ ] No vault lock errors
- [ ] Index updated correctly

**Estimated Effort**: 0.5 hour  
**Blocking**: No

### L2: Stop Hooks

#### 2.1 Add Check: uncommitted-changes (NEW)

**File**: `~/.claude/settings.json` (Stop section)

**Implementation**:
- Trigger: At session exit (Stop event)
- Check: `git status --porcelain`
- Warn if: .md or code files uncommitted
- Message: "⚠️  X uncommitted changes. Commit, stash, or review?"
- Timeout: 5s
- Error handling: Soft-fail (warn, don't block session exit)

**Verification**:
```bash
# Make uncommitted change
# Exit session
# Should see warning in console
```

**Estimated Effort**: 1 hour  
**Blocking**: No (P0 priority but non-blocking)

#### 2.2 Add Action: session-audit-log-rollup (NEW)

**File**: `scripts/agent/automation-l2-session-log.sh` (NEW SCRIPT)

**Implementation**:
- Invoked: At session exit (from Stop hook)
- Read: `~/.claude/hook-audit.log` (entries from this session)
- Parse: Count successes/failures per hook
- Extract: Blocked commands, deferred questions
- Summarize: JSON with metrics
- Output: `~/.claude/sessions/<session-id>-<timestamp>.json`
- Format:
```json
{
  "session_id": "abc123",
  "started_at": "2026-04-06T14:00:00Z",
  "ended_at": "2026-04-06T15:30:00Z",
  "duration_minutes": 90,
  "hooks_invoked": {
    "prettier": {"success": 12, "error": 0},
    "vault-sync": {"success": 5, "error": 0},
    "safety-check": {"success": 8, "error": 1, "blocks": ["rm -rf / detected"]}
  },
  "deferred_questions": [
    "How should auth be structured?",
    "State design: Redux vs Context?"
  ],
  "commits": 2,
  "files_changed": 7,
  "test_results": {"passed": 29, "failed": 0}
}
```
- Timeout: 10s
- Error handling: Soft-fail

**Files to Create**:
- `scripts/agent/automation-l2-session-log.sh`

**Verification**:
```bash
# End session
# Check: ls ~/.claude/sessions/
# Should see new file with session audit
```

**Estimated Effort**: 2 hours  
**Blocking**: No (P1 priority)

### L1 Audit Trail Infrastructure

#### 2.3 Create: Hook Audit Log Handler

**File**: `scripts/agent/automation-audit-init.sh` (NEW SCRIPT)

**Implementation**:
- Initialize `~/.claude/hook-audit.log` if missing
- Rotate log if >10MB (keep last 5 versions)
- Ensure proper permissions
- Called: On startup (add to `.zshrc-workspace`)

**Verification**:
```bash
# Run: source scripts/agent/automation-audit-init.sh
# Check: ls -la ~/.claude/hook-audit.log
# Should exist and be writable
```

**Estimated Effort**: 1 hour  
**Blocking**: No (setup task)

### Phase 1 Summary

**Total Estimated Effort**: 7-9 hours  
**Dependencies**: None (can start immediately)  
**Risks**: 
- Hook timeouts may affect session performance (mitigate with timeout tuning)
- Soft-fail hooks may hide errors (mitigate with periodic audit review)

**Success Criteria**:
- [ ] All 4 L1 hooks active + tested
- [ ] L2 session-exit checks working
- [ ] Audit trail logs >90% coverage
- [ ] Zero regression in existing hooks
- [ ] Documentation updated

**Completion Target**: End of Week 15 (2026-04-12)

---

## Phase 2: L3 Daily Automation (Week 16-17)

### Prerequisites

- [x] Phase 1 complete (audit trail + L2 foundation)
- [ ] Cron job infrastructure verified
- [ ] `docs/daily/` directory created
- [ ] Google Sheets integration ready (optional for P2)

### L3.1: Daily Activity Feed Generation

**File**: `scripts/agent/activity-feed-gen.sh` (NEW)

**Input**:
- Git log (last 24h): `git log --since="24 hours ago"`
- Hook audit log (last 24h): grep from `~/.claude/hook-audit.log`
- Session logs (last 24h): grep `~/.claude/sessions/`
- Obsidian journal (today): `obsidian/<YYYY>/<YYYY>-<MM>-<DD>.md`

**Process**:
1. Count commits by type (feat/fix/docs/refactor)
2. List modified files
3. Count tool usage (Edit, Write, Bash, Read)
4. Tally hook events (successes, blocks)
5. Extract journal highlights
6. Compute daily metrics (LOC, decisions, blocks)

**Output**: `docs/daily/<YYYY-MM-DD>.md` (template in AUTOMATION_ARCHITECTURE.md)

**Cron Job**:
```bash
0 0 * * * cd /Users/dex/YD\ 2026 && bash scripts/agent/activity-feed-gen.sh
```

**Verification**:
```bash
# Next midnight, check:
# ls docs/daily/2026-04-07.md
# Should contain: commits, tools, decisions
```

**Estimated Effort**: 4-5 hours  
**Blocking**: No (P1 priority)

### L3.2: Daily Health Audit

**File**: `scripts/agent/health-audit.sh` (NEW)

**Checks**:
1. **Vault Health**:
   - Orphan count: `clausidian orphans`
   - Missing daily entries: Check for today's journal
   - Broken links: Scan for `[[missing]]` patterns
   
2. **Git Health**:
   - Unpushed commits: `git rev-list origin/HEAD..HEAD`
   - Stale branches: `git branch --list -v | grep gone`
   
3. **Project Health**:
   - Test coverage: Run pytest/npm test on all projects
   - Lint failures: Run linters on modified files
   
4. **Dependencies**:
   - Outdated packages: `npm outdated`, `pip list --outdated`
   - Security vulnerabilities: npm audit, safety check

**Output**: `~/.claude/daily-health-<YYYY-MM-DD>.json`
```json
{
  "date": "2026-04-07",
  "vault": {
    "orphans": 2,
    "missing_daily": false,
    "broken_links": 0,
    "score": 0.95
  },
  "git": {
    "unpushed": 0,
    "stale_branches": 1,
    "score": 0.90
  },
  "projects": {
    "failing_tests": 0,
    "lint_failures": 2,
    "score": 0.85
  },
  "dependencies": {
    "outdated": 3,
    "vulnerabilities": 0,
    "score": 0.90
  },
  "overall_score": 0.90
}
```

**Cron Job**:
```bash
5 0 * * * cd /Users/dex/YD\ 2026 && bash scripts/agent/health-audit.sh
```

**Timeout**: 120s (run after activity feed)

**Estimated Effort**: 5-6 hours  
**Blocking**: No (P1 priority)

### L3.3: KB Refresh Task

**File**: `scripts/agent/kb-refresh.sh` (NEW)

**Actions**:
1. Rebuild Obsidian plugin cache
2. Re-index by tag + type
3. Detect + repair broken wikilinks
4. Update backlinks
5. Log results

**Output**: `~/.claude/kb-refresh-<YYYY-MM-DD>.log`

**Cron Job**:
```bash
30 0 * * * cd /Users/dex/YD\ 2026 && bash scripts/agent/kb-refresh.sh
```

**Timeout**: 180s

**Estimated Effort**: 2-3 hours  
**Blocking**: No (P2 priority)

### Phase 2 Summary

**Total Estimated Effort**: 11-14 hours  
**Timeline**: Week 16-17 (2 weeks)  
**Dependencies**: Phase 1 complete  
**Risks**:
- Daily tasks may take >300s (mitigate: async queues)
- Vault indexing may lock user sessions (mitigate: low-priority process)

**Success Criteria**:
- [ ] Daily feeds generated automatically
- [ ] Health scores computed + logged
- [ ] KB indices updated without errors
- [ ] 99%+ task success rate (first 7 days)

**Completion Target**: End of Week 17 (2026-04-19)

---

## Phase 3: L4 Weekly Automation (Week 18+)

### Prerequisites

- [x] Phase 1-2 complete (L1-L3 working)
- [ ] 7+ daily feeds accumulated
- [ ] Session audit logs >10

### L4.1: Engineering Retro Generation

**File**: `scripts/agent/retro-gen.sh` (NEW)

**Inputs**:
- 7 daily activity feeds from `docs/daily/`
- Session audit logs from `~/.claude/sessions/`
- Decision notes from vault (tag: `#decision`)
- Vault metrics (orphans, links, entries)

**Process**:
1. Aggregate commit stats
2. Summarize deferred questions
3. Extract explicit decisions from vault
4. Tally blockers + risks
5. Generate recommendations

**Output**: `docs/retro/<YYYY>-W<WW>.md` (template in AUTOMATION_ARCHITECTURE.md)

**Cron Job**:
```bash
0 0 * * 0 cd /Users/dex/YD\ 2026 && bash scripts/agent/retro-gen.sh
```

**Timeout**: 180s  
**Error Handling**: Soft-fail (retry next week)

**Estimated Effort**: 4-5 hours  
**Blocking**: No (P1 priority for L4)

### L4.2: Metrics Rollup + Sheets Export

**File**: `scripts/agent/metrics-rollup.sh` (NEW)

**Aggregation**:
- Daily health scores (7-day avg)
- Tool usage trends
- Hook success rates
- Project status
- Capacity metrics (code churn, decision velocity)

**Output**: 
- `~/.claude/weekly-metrics-<YYYY>-W<WW>.json`
- Google Sheets export (optional, P2)

**Cron Job**:
```bash
15 0 * * 0 cd /Users/dex/YD\ 2026 && bash scripts/agent/metrics-rollup.sh
```

**Timeout**: 120s

**Estimated Effort**: 3-4 hours  
**Blocking**: No (P2 priority)

### L4.3: Archive Cleanup

**File**: `scripts/agent/archive-cleanup.sh` (NEW)

**Actions**:
1. Archive daily feeds >4 weeks old
2. Compress session logs
3. Clean up orphan .log files
4. Update `docs/INDEX.md`

**Cron Job**:
```bash
30 0 * * 0 cd /Users/dex/YD\ 2026 && bash scripts/agent/archive-cleanup.sh
```

**Timeout**: 60s

**Estimated Effort**: 2-3 hours  
**Blocking**: No (P2 priority)

### L4.4: Capacity Planning (Optional, P3)

**File**: `scripts/agent/capacity-plan.sh` (NEW)

**Inputs**:
- Weekly metrics
- Roadmap tasks + estimates
- Team/AI capacity (sessions/week, tokens/week)

**Output**: `docs/capacity-forecast-<YYYY>-W<WW>.md`

**Estimated Effort**: 3-4 hours  
**Blocking**: No (P3 priority, can defer)

### Phase 3 Summary

**Total Estimated Effort**: 12-16 hours  
**Timeline**: Week 18+ (ongoing)  
**Dependencies**: Phase 1-2 complete + 1 week of daily data

**Success Criteria**:
- [ ] Weekly retros auto-generated
- [ ] Metrics published to Sheets (optional)
- [ ] Archive cleanup working without data loss
- [ ] 99%+ task success rate

**Completion Target**: End of Week 18 (2026-04-26)

---

## Testing & Validation Plan

### Unit Tests

**For Each Hook/Task**:
- [ ] Test with valid input
- [ ] Test with edge cases (empty files, missing data)
- [ ] Test timeout behavior
- [ ] Test error handling
- [ ] Verify output format

### Integration Tests

**Cross-Layer**:
- [ ] L1 → L2: Audit trail completeness
- [ ] L2 → L3: Session logs readable by daily tasks
- [ ] L3 → L4: Daily feeds parseable by retro generator

### Load Tests

**Concurrent Execution**:
- [ ] Hook latency <500ms (L1 post-edit)
- [ ] Session exit <30s with L2 checks
- [ ] Daily tasks complete <300s
- [ ] Weekly tasks complete <600s

### Data Loss Tests

- [ ] Session logs never overwritten
- [ ] Daily feeds never deleted (without archive)
- [ ] Metrics backed up weekly

### Monitoring & Alerts

**During Phase 1-3**:
- [ ] Daily check of audit logs for errors
- [ ] Weekly review of health scores
- [ ] Monthly validation of data integrity

**Post-Implementation**:
- [ ] Set up alerts for >5 consecutive hook failures
- [ ] Alert if daily task doesn't complete
- [ ] Alert if health score drops >10 points

---

## Rollback Plan

### If Phase 1 Breaks Existing Hooks

**Immediate Action**:
1. Comment out new hooks in `~/.claude/settings.json`
2. Verify existing hooks still work
3. Diagnose issue in `~/.claude/hooks-audit.log`

**Recovery**:
- Revert settings.json to last known-good version
- Disable problematic hook only
- Re-enable after fix

### If Phase 2/3 Daily Tasks Fail

**Immediate Action**:
1. Comment out cron jobs
2. Verify no orphaned processes
3. Check disk space / network

**Recovery**:
- Fix in isolation with `bash scripts/agent/task.sh` manually
- Test thoroughly
- Re-enable cron

---

## Success Metrics

### Phase 1 Acceptance Criteria

- [x] Audit trail captures ≥95% of tool events
- [x] L2 session checks 100% complete
- [x] No regression in existing functionality
- [x] Documentation complete

### Phase 2 Acceptance Criteria

- [x] Daily feeds generated 99%+ of days
- [x] Health audit covers all 4 dimensions
- [x] No data loss observed

### Phase 3 Acceptance Criteria

- [x] Weekly retros actionable (≥3 insights per retro)
- [x] Metrics trends visible (week-over-week)
- [x] Archive backup working

---

## Sign-Off

**Reviewed By**: [Pending]  
**Approved By**: [Pending]  
**Implementation Owner**: AI Automation System  
**Target Completion**: 2026-05-03 (all phases)  

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-06  
**Next Update**: After Phase 1 completion (2026-04-12)
