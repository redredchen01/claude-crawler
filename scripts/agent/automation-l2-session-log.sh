#!/bin/bash
# automation-l2-session-log.sh — Session Audit Log Rollup
# 在 session 退出时生成结构化审计日志
# 输出: ~/.claude/sessions/<session-id>-<timestamp>.json

set -e

AUDIT_LOG="${HOME}/.claude/hook-audit.log"
SESSION_DIR="${HOME}/.claude/sessions"
SESSION_ID="${SESSION_ID:-$(uuidgen 2>/dev/null | head -c 8 || date +%s)}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STARTED_AT="${STARTED_AT:-$TIMESTAMP}"

# 创建 sessions 目录
mkdir -p "$SESSION_DIR"

# 如果没有审计日志，创建空对象
if [ ! -f "$AUDIT_LOG" ]; then
  cat > "$SESSION_DIR/${SESSION_ID}-${TIMESTAMP}.json" <<EOF
{
  "session_id": "$SESSION_ID",
  "started_at": "$STARTED_AT",
  "ended_at": "$TIMESTAMP",
  "duration_minutes": 0,
  "hooks_invoked": {},
  "deferred_questions": [],
  "commits": 0,
  "files_changed": 0,
  "test_results": {"passed": 0, "failed": 0}
}
EOF
  exit 0
fi

# 解析审计日志，统计每个钩子的结果
HOOKS_SUMMARY=$(awk -F'|' '{gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print $2}' "$AUDIT_LOG" | sort | uniq -c | sort -rn)

# 生成 hooks_invoked JSON（简化版）
HOOKS_JSON="{}"
while IFS= read -r line; do
  COUNT=$(echo "$line" | awk '{print $1}')
  HOOK=$(echo "$line" | awk '{print $2}')
  if [ -n "$HOOK" ]; then
    HOOKS_JSON=$(echo "$HOOKS_JSON" | jq --arg hook "$HOOK" --argjson count "$COUNT" '.[$hook] = {"success": $count, "error": 0}')
  fi
done <<< "$HOOKS_SUMMARY"

# 统计 commits
COMMITS=$(git log --oneline -1 2>/dev/null | wc -l || echo "0")

# 统计 changed files
FILES_CHANGED=$(git status --porcelain 2>/dev/null | wc -l || echo "0")

# 生成最终 JSON
cat > "$SESSION_DIR/${SESSION_ID}-${TIMESTAMP}.json" <<EOF
{
  "session_id": "$SESSION_ID",
  "started_at": "$STARTED_AT",
  "ended_at": "$TIMESTAMP",
  "duration_minutes": 0,
  "hooks_invoked": $HOOKS_JSON,
  "deferred_questions": [],
  "commits": $COMMITS,
  "files_changed": $FILES_CHANGED,
  "test_results": {"passed": 0, "failed": 0}
}
EOF

echo "✓ Session audit log saved to: $SESSION_DIR/${SESSION_ID}-${TIMESTAMP}.json"
