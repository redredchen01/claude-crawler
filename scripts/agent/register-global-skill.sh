#!/bin/bash
# scripts/agent/register-global-skill.sh — Promotes local script to Claude Global Skill
# Generates .md definition in ~/.claude/commands/ linking to the local script.

set -euo pipefail

WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

SKILL_NAME="$1"

if [ -z "$SKILL_NAME" ]; then
  echo "Usage: register-global-skill.sh <local-script-name-without-sh>"
  exit 1
fi

LOCAL_SCRIPT="$WORKSPACE_ROOT/scripts/agent/${SKILL_NAME}.sh"
GLOBAL_CMD_DIR="$HOME/.claude/commands"
TARGET_MD="$GLOBAL_CMD_DIR/${SKILL_NAME}.md"

if [ ! -f "$LOCAL_SCRIPT" ]; then
  log_error "Local script not found: $LOCAL_SCRIPT"
fi

ensure_dir "$GLOBAL_CMD_DIR"

# Extract description from header
DESC=$(grep "^# scripts/agent/" "$LOCAL_SCRIPT" | head -1 | cut -d'—' -f2 | xargs)
[ -z "$DESC" ] && DESC="Automated skill from YD 2026 workspace"

log_info "Registering global skill: $SKILL_NAME..."

cat <<EOF > "$TARGET_MD"
---
description: $DESC
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[args...]"
---

# /$SKILL_NAME — $DESC

This is an automated proxy for the local workspace script.

## Trigger
- Command: "$SKILL_NAME"
- Task: "$DESC"

## Implementation

\`\`\`bash
bash "$LOCAL_SCRIPT" "\$@"
\`\`\`

---
*Registered by register-global-skill.sh on $(date)*
EOF

log_info "✅ Skill /$SKILL_NAME registered at $TARGET_MD"
log_info "💡 You can now run this skill globally using: /$SKILL_NAME"
