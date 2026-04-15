# Session-Wrap v3.4.0 Testing Guide

Comprehensive testing suite for validating all agent tools and multi-agent coordination features.

## Overview

Three test suites validate different aspects:

| Test Suite | Purpose | Duration | Coverage |
|-----------|---------|----------|----------|
| `test-agent-tools.sh` | Unit tests for each agent tool | ~5 sec | 7 agent tools |
| `validate-demo.sh` | End-to-end demo validation | ~30 sec | Complete demo workflow |
| `integration-test.sh` | Real-world scenarios | ~15 sec | 10 multi-agent scenarios |

---

## Quick Start

### Run All Tests

```bash
cd ~/YD\ 2026

# Run all three test suites
bash scripts/test-agent-tools.sh
bash scripts/validate-demo.sh
bash scripts/integration-test.sh
```

### Run Individual Tests

```bash
# Test only the 7 agent tools
bash scripts/test-agent-tools.sh

# Validate the demo works
bash scripts/validate-demo.sh

# Test multi-agent scenarios
bash scripts/integration-test.sh
```

---

## Test Suite Details

### 1. test-agent-tools.sh

Unit tests for each of the 7 agent tools.

**What it tests:**
- `agent-knowledge` — set, get, list operations
- `agent-decision` — log, list, search functionality
- `agent-tasks` — add, claim, done, next, status operations
- `agent-checkpoint` — save, list, restore functionality
- `agent-share` — write, read, list operations
- `agent-context` — context injection for startup
- `agent-optimize` — memory stats and optimization

**Expected output:**
```
TEST 1: agent-knowledge
────────────────────────
✅ PASS: agent-knowledge set
✅ PASS: agent-knowledge get
✅ PASS: agent-knowledge list

TEST 2: agent-decision
────────────────────────
✅ PASS: agent-decision log
✅ PASS: agent-decision list contains logged decision
✅ PASS: agent-decision search

... (more tests)

📊 TEST SUMMARY
═══════════════════════════════════════════════════════════
Total Tests:  30
Passed:       30
Failed:       0
Pass Rate:    100%

🎉 ALL TESTS PASSED!
```

**Run alone:**
```bash
bash scripts/test-agent-tools.sh
```

**Custom memory location:**
```bash
export YD_MEMORY="/tmp/my-test"
bash scripts/test-agent-tools.sh
```

---

### 2. validate-demo.sh

End-to-end validation of the TODO-DEMO application.

**What it validates:**
1. Demo scripts exist and are executable
2. Individual agent sessions (Codex, Cursor, Windsurf)
3. Memory structure is created correctly
4. Task graph contains expected tasks
5. Knowledge base initialization
6. Cross-agent communication
7. Session wrap files are created
8. Full demo orchestration completes
9. Demo output structure is correct
10. Demo completes in reasonable time (<60s)

**Expected output:**
```
STEP 1: Verify Demo Scripts
────────────────────────
✅ PASS: Script exists and is executable: run-agent-codex.sh
✅ PASS: Script exists and is executable: run-agent-cursor.sh
✅ PASS: Script exists and is executable: run-agent-windsurf.sh
✅ PASS: Script exists and is executable: run-full-demo.sh

STEP 2: Run Individual Agent Sessions
────────────────────────
✅ PASS: Codex session completed without errors
✅ PASS: Codex session completed successfully
✅ PASS: Codex output contains database design
✅ PASS: Codex output contains auth API

... (more steps)

📊 VALIDATION SUMMARY
═══════════════════════════════════════════════════════════
Total Checks:  40
Passed:        40
Failed:        0
Pass Rate:     100%

🎉 DEMO VALIDATION PASSED!
```

**Run alone:**
```bash
bash scripts/validate-demo.sh
```

**Clean validation (fresh memory):**
```bash
export YD_MEMORY="$HOME/.session-wrap-demo-fresh"
bash scripts/validate-demo.sh
```

---

### 3. integration-test.sh

Real-world multi-agent scenarios testing coordination and workflow patterns.

**Scenarios validated:**
1. Single developer, multiple sessions
   - Knowledge persists across sessions
   - Decisions are remembered
   - Tasks continue from where they left off

2. Two agents, dependency coordination
   - Agents don't step on each other
   - Task dependencies are respected
   - Cross-agent memory sharing works

3. Three agents in parallel
   - Multiple agents can work simultaneously
   - Task graph unlocks properly
   - Agent progress is published

4. Decision preservation & recovery
   - Decisions prevent rework
   - Agents search and find decisions
   - Decision reasoning is preserved

5. Memory lifecycle & optimization
   - Decisions are never deleted
   - Sessions can be archived
   - Memory stats are available

6. Cross-machine consistency
   - All memory components exist
   - Consistency across machines
   - Memory index available

7. Error recovery with checkpoints
   - Checkpoints created before risky changes
   - Can list and restore checkpoints
   - Recovery state is preserved

8. Knowledge base evolution
   - Knowledge can be updated
   - Updates are immediately accessible
   - Project evolution is tracked

9. Complex task dependencies
   - Multi-level dependencies work
   - Parallel tasks unlock correctly
   - Final task sequence is correct

10. Full context injection
    - Context includes all knowledge
    - Recent decisions are in context
    - New agents start with full state

**Expected output:**
```
━━━ SCENARIO 1: Single Developer, Multiple Sessions ━━━
✅ Developer initializes project knowledge
✅ Developer claims first task
✅ Developer logs decision for auth method
✅ Developer creates checkpoint before starting
✅ Developer completes first task
✅ Developer saves session

Simulating new session (different machine/day)...
✅ Context loads previous decisions automatically
✅ Next tasks show correctly (auth-login done, auth-logout ready)
✅ Developer completes second task in new session
✅ Developer saves session

━━━ SCENARIO 2: Two Agents, Dependency Coordination ━━━
✅ Backend agent completes first task and publishes progress
✅ Frontend agent reads backend's progress
✅ Frontend agent sees api-users is ready (db-setup done)
✅ Frontend agent completes task and publishes progress

... (more scenarios)

📊 INTEGRATION TEST SUMMARY
═══════════════════════════════════════════════════════════
Total Tests:   100
Passed:        100
Failed:        0
Pass Rate:     100%

🎉 INTEGRATION TEST PASSED!

All scenarios validated:
  ✅ Single developer with multiple sessions
  ✅ Two agents with task dependencies
  ✅ Three agents working in parallel
  ✅ Decision preservation across sessions
  ✅ Memory lifecycle and optimization
  ✅ Cross-machine consistency
  ✅ Error recovery with checkpoints
  ✅ Knowledge base evolution
  ✅ Complex task dependencies
  ✅ Full context injection at startup

Session-wrap is production-ready! 🚀
```

**Run alone:**
```bash
bash scripts/integration-test.sh
```

---

## Running All Tests

```bash
# Run all three suites and save results
bash scripts/test-agent-tools.sh | tee test-results-unit.txt
bash scripts/validate-demo.sh | tee test-results-demo.txt
bash scripts/integration-test.sh | tee test-results-integration.txt

# Summary
echo "Check results:"
cat test-results-unit.txt | grep "SUMMARY" -A 10
cat test-results-demo.txt | grep "SUMMARY" -A 10
cat test-results-integration.txt | grep "SUMMARY" -A 10
```

---

## Test Cleanup

Each test suite uses its own memory directory to avoid conflicts:

```bash
# Clean up test directories
rm -rf ~/.session-wrap-test
rm -rf ~/.session-wrap-demo-validate
rm -rf ~/.session-wrap-integration-test
rm -rf ~/.session-wrap-demo

# Or clean everything
rm -rf ~/.session-wrap*
```

---

## Environment Variables

### YD_MEMORY

Override the memory directory:

```bash
export YD_MEMORY="/custom/path"
bash scripts/test-agent-tools.sh
```

### SESSION_WRAP_API_URL

For cloud sync testing (optional):

```bash
export SESSION_WRAP_API_URL="http://localhost:3000"
bash scripts/validate-demo.sh
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Session-Wrap

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install session-wrap
        run: npm install -g session-wrap-skill

      - name: Load aliases
        run: source ~/.zshrc-wrap

      - name: Run unit tests
        run: bash scripts/test-agent-tools.sh

      - name: Validate demo
        run: bash scripts/validate-demo.sh

      - name: Integration tests
        run: bash scripts/integration-test.sh
```

### Local Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running tests before commit..."
bash scripts/test-agent-tools.sh || exit 1
bash scripts/validate-demo.sh || exit 1
bash scripts/integration-test.sh || exit 1
echo "✅ All tests passed!"
```

---

## Troubleshooting

### Test fails with "command not found"

```bash
# Ensure session-wrap-skill is installed
npm install -g session-wrap-skill

# Load aliases
source ~/.zshrc-wrap

# Verify installation
which agent-context
which agent-tasks
```

### Memory directory permission error

```bash
# Ensure directory is writable
chmod 755 ~/.session-wrap-test
chmod 755 ~/.session-wrap-demo-validate
chmod 755 ~/.session-wrap-integration-test
```

### Tests timeout

```bash
# Some tests take longer on slow systems
# Increase timeout in scripts (default 30s for demo):
timeout 60 bash scripts/validate-demo.sh
```

### jq not found

```bash
# Install jq for JSON parsing
# macOS
brew install jq

# Linux
apt-get install jq

# Verify
jq --version
```

---

## Test Metrics

Expected results when all tests pass:

| Test Suite | Tests | Pass Rate | Duration |
|-----------|-------|-----------|----------|
| test-agent-tools.sh | 30 | 100% | ~5 sec |
| validate-demo.sh | 40 | 100% | ~30 sec |
| integration-test.sh | 100 | 100% | ~15 sec |
| **Total** | **170** | **100%** | **~50 sec** |

---

## Success Criteria

✅ **All tests pass** — Every test returns 0 exit code
✅ **No memory errors** — Memory structure is correct
✅ **Cross-agent works** — Agents can share state
✅ **Demo completes** — Full orchestration succeeds
✅ **Performance** — Demo < 60 seconds

---

## What Tests Prove

1. **Reliability** — All agent tools work correctly
2. **Correctness** — Multi-agent coordination is sound
3. **Completeness** — Feature coverage is comprehensive
4. **Performance** — Execution is fast enough
5. **Robustness** — Error handling works
6. **Usability** — Real-world scenarios work

---

## Next Steps After Testing

✅ **All tests pass?** → Ready for production use
⚠️ **Some tests fail?** → Debug using test output
🚀 **Ready to deploy?** → See PRODUCTION-SETUP.md

---

**Testing is the foundation of confidence. Session-wrap v3.4.0 is thoroughly validated!** ✅

