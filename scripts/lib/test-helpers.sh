#!/bin/bash
# Shared test helpers for session-wrap test suites
# Usage: source "$(dirname "$0")/../lib/test-helpers.sh"

# ============================================
# Colors
# ============================================
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# Counters
# ============================================
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# ============================================
# Test Functions
# ============================================

test_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((TESTS_PASSED++))
}

test_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

test_skip() {
  echo -e "${YELLOW}⊘${NC} $1 (skipped)"
  ((TESTS_SKIPPED++))
}

section() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# ============================================
# Assertion Helpers
# ============================================

assert_file_exists() {
  if [ -f "$1" ]; then
    test_pass "File exists: $1"
    return 0
  else
    test_fail "File does not exist: $1"
    return 1
  fi
}

assert_contains() {
  if grep -q "$2" "$1"; then
    test_pass "File contains: $2"
    return 0
  else
    test_fail "File does not contain: $2"
    return 1
  fi
}

assert_json_valid() {
  if jq empty "$1" 2>/dev/null; then
    test_pass "Valid JSON: $1"
    return 0
  else
    test_fail "Invalid JSON: $1"
    return 1
  fi
}

# ============================================
# Summary
# ============================================

test_summary() {
  local suite_name="${1:-TEST}"
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "📊 ${suite_name} SUMMARY"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  local TOTAL=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
  local PASS_RATE=0
  [ "$TOTAL" -gt 0 ] && PASS_RATE=$(( (TESTS_PASSED * 100) / TOTAL ))

  echo -e "Total Tests:   ${BLUE}$TOTAL${NC}"
  echo -e "Passed:        ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:        ${RED}$TESTS_FAILED${NC}"
  [ "$TESTS_SKIPPED" -gt 0 ] && echo -e "Skipped:       ${YELLOW}$TESTS_SKIPPED${NC}"
  echo -e "Pass Rate:     ${BLUE}${PASS_RATE}%${NC}"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    return 0
  else
    echo -e "${RED}❌ SOME TESTS FAILED ($TESTS_FAILED)${NC}"
    return 1
  fi
}
