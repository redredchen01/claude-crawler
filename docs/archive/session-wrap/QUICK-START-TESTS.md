# Session-Wrap Testing Quick Start

Fast reference for running all tests and validations.

## 30 Seconds: Full Test Suite

```bash
cd ~/YD\ 2026

# Run all tests (3 suites, ~50 seconds total)
bash scripts/test-agent-tools.sh && \
bash scripts/validate-demo.sh && \
bash scripts/integration-test.sh

# Expected: 170 tests, 100% pass rate
```

## Individual Test Suites

### Unit Tests (5 seconds)
Tests all 7 agent tools individually.

```bash
bash scripts/test-agent-tools.sh
```

**Validates:**
- ✅ agent-knowledge (set/get/list)
- ✅ agent-decision (log/list/search)
- ✅ agent-tasks (add/claim/done/next/status)
- ✅ agent-checkpoint (save/list/restore)
- ✅ agent-share (write/read/list)
- ✅ agent-context (context injection)
- ✅ agent-optimize (stats/archive)

**Result:** 30 tests, expect 100% pass

---

### Demo Validation (30 seconds)
Tests the complete 3-agent todo app demo.

```bash
bash scripts/validate-demo.sh
```

**Validates:**
- ✅ Demo scripts exist and run
- ✅ Codex (backend) session completes
- ✅ Cursor (frontend) session completes
- ✅ Windsurf (docs) session completes
- ✅ Memory structure created
- ✅ Task graph working
- ✅ Knowledge base initialized
- ✅ Cross-agent communication
- ✅ Full orchestration succeeds
- ✅ Performance acceptable

**Result:** 40 checks, expect 100% pass

---

### Integration Tests (15 seconds)
Tests 10 real-world multi-agent scenarios.

```bash
bash scripts/integration-test.sh
```

**Scenarios validated:**
1. ✅ Single developer, multiple sessions
2. ✅ Two agents, dependency coordination
3. ✅ Three agents in parallel
4. ✅ Decision preservation
5. ✅ Memory lifecycle
6. ✅ Cross-machine consistency
7. ✅ Error recovery
8. ✅ Knowledge evolution
9. ✅ Complex task dependencies
10. ✅ Full context injection

**Result:** 100 tests, expect 100% pass

---

## Run the Demo

### Full Demo (7 seconds)
3 agents building a todo app.

```bash
bash examples/run-full-demo.sh
```

**Timeline:**
- Day 1: Codex creates database + auth API
- Day 2: Cursor builds login UI + Windsurf writes docs

**Output:** Task graph, decisions, agent states, memory stats

---

### Individual Agent Sessions

**Backend (Codex):**
```bash
bash examples/run-agent-codex.sh
```

**Frontend (Cursor):**
```bash
bash examples/run-agent-cursor.sh
```

**Docs (Windsurf):**
```bash
bash examples/run-agent-windsurf.sh
```

---

## View Test Results

### After Running Tests

```bash
# View memory structure
ls -la ~/.session-wrap-test/

# Check decisions
cat ~/.session-wrap-test/decisions/*.md

# Check task graph
cat ~/.session-wrap-test/tasks/tasks.json

# Check agent states
cat ~/.session-wrap-test/agents/*.md
```

### Performance Stats

```bash
# Memory usage
du -sh ~/.session-wrap-test/

# Number of tests passed
grep "PASS" /tmp/test-output.txt | wc -l
```

---

## Interpret Results

### ✅ All Tests Passed
```
🎉 ALL TESTS PASSED!
Total Tests: 170
Pass Rate: 100%
```
→ Session-wrap is working correctly

### ❌ Some Tests Failed
```
❌ SOME TESTS FAILED
Total Tests: 170
Failed: 5
Pass Rate: 97%
```
→ Check the specific failures, then retry

---

## Troubleshooting

### Command not found: agent-*
```bash
# Load aliases
source ~/.zshrc-wrap

# Verify
which agent-context
```

### Permission denied: *.sh
```bash
# Make scripts executable
chmod +x scripts/test-*.sh
chmod +x scripts/validate-*.sh
chmod +x scripts/integration-*.sh
chmod +x examples/run-*.sh
```

### Memory directory error
```bash
# Create directory
mkdir -p ~/.session-wrap-test

# Verify writable
touch ~/.session-wrap-test/test.txt && rm $_
```

### jq not found
```bash
# Install jq
brew install jq          # macOS
apt-get install jq       # Linux
```

---

## Environment Variables

### Custom Memory Directory
```bash
export YD_MEMORY="/custom/path"
bash scripts/test-agent-tools.sh
```

### Cloud Sync (optional)
```bash
export SESSION_WRAP_API_URL="http://localhost:3000"
bash scripts/validate-demo.sh
```

### Verbose Output
```bash
export DEBUG=1
bash scripts/integration-test.sh
```

---

## CI/CD Integration

### GitHub Actions
```yaml
- run: source ~/.zshrc-wrap
- run: bash scripts/test-agent-tools.sh
- run: bash scripts/validate-demo.sh
- run: bash scripts/integration-test.sh
```

### Pre-commit Hook
```bash
#!/bin/bash
bash scripts/test-agent-tools.sh || exit 1
bash scripts/integration-test.sh || exit 1
```

### GitLab CI
```yaml
test:
  script:
    - source ~/.zshrc-wrap
    - bash scripts/test-agent-tools.sh
    - bash scripts/validate-demo.sh
```

---

## Success Criteria

✅ All 3 test suites pass
✅ Demo completes without errors
✅ Memory structure is correct
✅ All decisions are logged
✅ Task graph works
✅ Cross-agent communication succeeds

---

## Next Steps

✅ **Tests pass?** → Session-wrap is ready to use
🚀 **Ready for team?** → See INTEGRATIONS.md
📚 **Want to learn more?** → See AGENT-WORKFLOW.md
🌍 **Deploy to production?** → See PRODUCTION-SETUP.md

---

**Happy testing! Session-wrap v3.4.0 is production-ready.** ✅

