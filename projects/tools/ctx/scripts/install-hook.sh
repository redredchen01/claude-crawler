#!/usr/bin/env bash
# Install ctx hook into Claude Code settings
# Usage: bash scripts/install-hook.sh

set -euo pipefail

HOOK_PATH="$(cd "$(dirname "$0")/../hooks" && pwd)/ctx-track.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"

if [ ! -f "$HOOK_PATH" ]; then
  echo "❌ Hook not found at $HOOK_PATH"
  exit 1
fi

echo "🧠 ctx — Installing auto-tracking hook"
echo ""

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "  Creating $SETTINGS_FILE..."
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo '{}' > "$SETTINGS_FILE"
fi

# Use python to safely merge hook into settings
python3 - "$SETTINGS_FILE" "$HOOK_PATH" << 'PYEOF'
import json, sys

settings_file = sys.argv[1]
hook_path = sys.argv[2]

with open(settings_file) as f:
    settings = json.load(f)

hooks = settings.setdefault("hooks", {})
after_tool = hooks.setdefault("afterToolUse", [])

# Check if already installed
hook_cmd = f"bash {hook_path}"
for entry in after_tool:
    cmd = entry if isinstance(entry, str) else entry.get("command", "")
    if "ctx-track" in cmd:
        print(f"  ✅ Hook already installed in {settings_file}")
        sys.exit(0)

after_tool.append({
    "command": hook_cmd,
    "description": "ctx: auto-track context window state"
})

with open(settings_file, "w") as f:
    json.dump(settings, f, indent=2)

print(f"  ✅ Hook installed: {hook_cmd}")
print(f"  📁 Settings: {settings_file}")
PYEOF

echo ""
echo "✨ Done! ctx will now auto-track every tool call."
echo "   View status: python3 scripts/ctx_status.py"
echo ""
