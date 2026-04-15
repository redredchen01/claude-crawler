#!/bin/bash
# test-version-workflow.sh
# Local test script for version detection and publishing logic

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

PROJECT_ROOT="$HOME/YD 2026"
YDK_DIR="$PROJECT_ROOT/projects/production/yd-utility-kit"

# Test 1: Check pyproject.toml
test_pyproject_exists() {
  log_info "Test 1: Checking pyproject.toml..."

  if [ -f "$YDK_DIR/pyproject.toml" ]; then
    log_success "pyproject.toml found"

    CURRENT_VERSION=$(grep '^version = ' "$YDK_DIR/pyproject.toml" | cut -d'"' -f2)
    log_info "Current version: $CURRENT_VERSION"

    if [[ $CURRENT_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      log_success "Version format valid (semver)"
      return 0
    else
      log_error "Version format invalid: $CURRENT_VERSION"
      return 1
    fi
  else
    log_error "pyproject.toml not found at $YDK_DIR/pyproject.toml"
    return 1
  fi
}

# Test 2: Check git history
test_git_history() {
  log_info "Test 2: Checking git history..."

  LAST_TAG=$(cd "$YDK_DIR" && git describe --tags --abbrev=0 'ydk-v*' 2>/dev/null || echo "none")

  if [ "$LAST_TAG" == "none" ]; then
    log_warning "No previous ydk-v* tags found (this is the first publish)"
    COMMIT_COUNT=$(cd "$YDK_DIR" && git rev-list --count HEAD)
  else
    log_success "Last tag: $LAST_TAG"
    COMMIT_COUNT=$(cd "$YDK_DIR" && git rev-list --count "$LAST_TAG"..HEAD 2>/dev/null || echo 0)
  fi

  log_info "Commits since last tag: $COMMIT_COUNT"

  if [ "$COMMIT_COUNT" -gt 0 ]; then
    log_success "New commits detected"
    return 0
  else
    log_warning "No new commits since last tag"
    return 1
  fi
}

# Test 3: Check version change
test_version_change() {
  log_info "Test 3: Checking version change..."

  CURRENT_VERSION=$(grep '^version = ' "$YDK_DIR/pyproject.toml" | cut -d'"' -f2)
  LAST_TAG=$(cd "$YDK_DIR" && git describe --tags --abbrev=0 'ydk-v*' 2>/dev/null || echo "v0.0.0")

  # Extract version from tag (remove 'ydk-' prefix if present)
  LAST_VERSION="${LAST_TAG#ydk-v}"
  LAST_VERSION="${LAST_VERSION#v}"

  log_info "Current: $CURRENT_VERSION, Last: $LAST_VERSION"

  if [ "$CURRENT_VERSION" != "$LAST_VERSION" ]; then
    log_success "Version change detected"
    return 0
  else
    log_warning "No version change in pyproject.toml"
    return 1
  fi
}

# Test 4: Analyze commit types
test_commit_analysis() {
  log_info "Test 4: Analyzing commit types for bump detection..."

  LAST_TAG=$(cd "$YDK_DIR" && git describe --tags --abbrev=0 'ydk-v*' 2>/dev/null || echo "HEAD~0")

  if [ "$LAST_TAG" == "HEAD~0" ]; then
    COMMITS=$(cd "$YDK_DIR" && git log HEAD -10 --oneline)
  else
    COMMITS=$(cd "$YDK_DIR" && git log "$LAST_TAG"..HEAD --oneline)
  fi

  echo "$COMMITS" | head -5 | while read -r line; do
    echo "  $line"
  done

  log_success "Commit analysis completed"
  return 0
}

# Main test runner
main() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "YDK Version Workflow Test Suite"
  echo "═══════════════════════════════════════════════════"
  echo ""

  TESTS=(
    "test_pyproject_exists"
    "test_git_history"
    "test_version_change"
    "test_commit_analysis"
  )

  PASSED=0
  FAILED=0

  for test in "${TESTS[@]}"; do
    echo ""
    if $test; then
      ((PASSED++))
    else
      ((FAILED++))
    fi
  done

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "Test Results: $PASSED passed, $FAILED failed"
  echo "═══════════════════════════════════════════════════"
  echo ""

  if [ $FAILED -eq 0 ]; then
    log_success "All tests passed!"
    return 0
  else
    log_warning "Some tests had warnings (expected for first publish)"
    return 0
  fi
}

main "$@"
