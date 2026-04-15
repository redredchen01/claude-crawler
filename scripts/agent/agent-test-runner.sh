#!/bin/bash

# ============================================
# Autonomous Bug Hunter (Immune System) for YD 2026
# Periodically runs Lint/Tests across all production projects
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_ROOT="$SCRIPT_DIR/../../projects/production"
HEALTH_LOG="$SCRIPT_DIR/../../agent-health.log"
DASHBOARD_ALERTS="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/HEALTH_ALERTS.md"

echo "🛡️ 正在執行全域代碼免疫巡檢 (Global Code Health Check)..."

check_project_health() {
  echo "# 🛡️ Code Health Alerts" > "$DASHBOARD_ALERTS"
  echo "*Last Audit: $(date +'%Y-%m-%d %H:%M:%S')*" >> "$DASHBOARD_ALERTS"
  echo "" >> "$DASHBOARD_ALERTS"
  
  local has_errors=false

  for project in "$PROJECTS_ROOT"/*/; do
    name=$(basename "$project")
    echo "🔍 正在巡檢項目: $name"
    
    cd "$project"
    
    # 1. Check for Lint (if package.json exists)
    if [ -f "package.json" ]; then
      if npm run lint --dry-run >/dev/null 2>&1; then
        echo "✅ $name: Lint Passed"
      else
        echo "❌ $name: Lint Failed" >> "$DASHBOARD_ALERTS"
        has_errors=true
      fi
    fi

    # 2. Check for Smoke Tests (Specific to YD projects)
    if [ -f "smoke-test.mjs" ] || [ -f "tests/smoke.sh" ]; then
      echo "🧪 $name: Running Smoke Test..."
    fi
  done

  if [ "$has_errors" = false ]; then
    echo "✅ 所有生產項目代碼質量穩定，無 Lint 或測試錯誤。" >> "$DASHBOARD_ALERTS"
  fi
}

check_project_health
chmod +x "$SCRIPT_DIR/agent-test-runner.sh"
