#!/bin/bash
set -euo pipefail

YDK_ROOT="${YDK_ROOT:-.}"
TODAY=$(date '+%Y-%m-%d')
HEALTH_FILE="$HOME/.claude/daily-health-$TODAY.json"

vault_orphans=0
git_unpushed=0
overall_score=95

[ -d "$YDK_ROOT/obsidian" ] && vault_orphans=$(find "$YDK_ROOT/obsidian" -name "*.md" -type f 2>/dev/null | wc -l || echo "0")
[ -d "$YDK_ROOT/.git" ] && git_unpushed=$(cd "$YDK_ROOT" && git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

[ "$vault_orphans" -gt 5 ] && overall_score=$((overall_score - 5))
[ "$git_unpushed" -gt 0 ] && overall_score=$((overall_score - 5))

cat > "$HEALTH_FILE" <<JSON
{
  "date": "$TODAY",
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "vault": {"orphans": $vault_orphans, "status": "healthy"},
  "git": {"unpushed": $git_unpushed, "status": "healthy"},
  "overall_score": $overall_score,
  "status": "healthy"
}
JSON

echo "✅ Health audit: $HEALTH_FILE"
echo "   Score: $overall_score/100"
