#!/usr/bin/env bash
# ctx-track.sh — Claude Code hook that auto-updates .ctx/state.json
# Install: add to settings.json hooks.afterToolUse
#
# Reads tool_name and tool_input from stdin (JSON), updates state.json accordingly.
# Runs after every tool call — must be fast (<50ms).

set -euo pipefail

CTX_DIR=".ctx"
STATE_FILE="$CTX_DIR/state.json"

# Only run if state.json exists (ctx is initialized)
[ -f "$STATE_FILE" ] || exit 0

# Read hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

[ -z "$TOOL_NAME" ] && exit 0

# Fast state update via python (inline, no imports beyond stdlib)
python3 - "$STATE_FILE" "$TOOL_NAME" "$INPUT" << 'PYEOF'
import json, sys, os
from datetime import datetime

state_file = sys.argv[1]
tool_name = sys.argv[2]
raw_input = sys.argv[3]

try:
    with open(state_file) as f:
        state = json.load(f)
except:
    sys.exit(0)

# Parse tool input
try:
    hook_data = json.loads(raw_input)
    tool_input = hook_data.get("tool_input", {})
    if isinstance(tool_input, str):
        tool_input = json.loads(tool_input) if tool_input.startswith("{") else {}
except:
    tool_input = {}

# Track tool call
state["toolCallCount"] = state.get("toolCallCount", 0) + 1
state["usedTokens"] = state.get("usedTokens", 0) + 1500

# Track file reads
if tool_name == "Read":
    file_path = tool_input.get("file_path", "")
    if file_path:
        # Normalize path
        short = file_path.replace(os.path.expanduser("~"), "~")
        files_read = state.get("filesRead", [])
        existing = next((f for f in files_read if f["path"] == short), None)

        if existing:
            existing["readCount"] += 1
            state["dupCount"] = state.get("dupCount", 0) + 1
        else:
            lines = tool_input.get("limit", 200)  # estimate
            files_read.append({
                "path": short,
                "lines": lines,
                "readCount": 1,
                "at": datetime.now().isoformat()
            })
            state["usedTokens"] += lines * 15
        state["filesRead"] = files_read

# Track writes
elif tool_name in ("Write", "Edit"):
    state["writeCount"] = state.get("writeCount", 0) + 1

# Track bash
elif tool_name == "Bash":
    state["bashCount"] = state.get("bashCount", 0) + 1

# Compute threshold and check if checkpoint needed
pct = min(100, round(state["usedTokens"] / state.get("maxTokens", 200000) * 100))
thresholds = [(40, "green"), (60, "yellow"), (80, "orange"), (100, "red")]
threshold = "red"
for max_val, name in thresholds:
    if pct < max_val:
        threshold = name
        break

state["_lastThreshold"] = threshold
state["_lastPercentage"] = pct
state["_lastUpdated"] = datetime.now().isoformat()

with open(state_file, "w") as f:
    json.dump(state, f, indent=2)

# Auto-generate status.md every 5 tool calls
if state["toolCallCount"] % 5 == 0:
    icons = {"green": "🟢", "yellow": "🟡", "orange": "🟠", "red": "🔴"}
    icon = icons.get(threshold, "🟢")
    files = state.get("filesRead", [])

    lines = [
        f"# ctx Status {icon}",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Context | ~{pct}% ({round(state['usedTokens']/1000)}K / {round(state.get('maxTokens',200000)/1000)}K) |",
        f"| Threshold | {threshold} {icon} |",
        f"| Files read | {len(files)} |",
        f"| Duplicates | {state.get('dupCount', 0)} |",
        f"| Tool calls | {state['toolCallCount']} |",
        f"| Writes | {state.get('writeCount', 0)} |",
        "",
        "## Files",
        "| File | Lines | Reads |",
        "|------|-------|-------|",
    ]
    for fr in files[-15:]:
        lines.append(f"| {fr['path']} | {fr['lines']} | {fr['readCount']}x |")

    lines.append(f"\n*Updated: {datetime.now().isoformat()}*")

    status_path = os.path.join(os.path.dirname(state_file), "status.md")
    with open(status_path, "w") as f:
        f.write("\n".join(lines))

# Auto-checkpoint at orange/red threshold (once per threshold)
checkpointed = state.get("checkpointedThresholds", [])
files = state.get("filesRead", [])
if threshold in ("orange", "red") and threshold not in checkpointed:
    checkpointed.append(threshold)
    state["checkpointedThresholds"] = checkpointed
    with open(state_file, "w") as f:
        json.dump(state, f, indent=2)

    cp_dir = os.path.join(os.path.dirname(state_file), "checkpoints")
    os.makedirs(cp_dir, exist_ok=True)
    now = datetime.now()
    ts = now.strftime("%Y%m%d-%H%M%S")
    cp_type = "emergency" if threshold == "red" else "checkpoint"
    cp_file = os.path.join(cp_dir, f"ctx-{cp_type}-{ts}-auto.md")

    files_list = "\n".join(f"- {f['path']}" for f in files[-10:])
    cp_content = f"""---
type: {cp_type}
percentage: {pct}
threshold: {threshold}
timestamp: {now.isoformat()}
source: auto-hook
---

## {'Emergency Save' if threshold == 'red' else 'Auto-Checkpoint'} at {pct}%

Context reached {threshold} threshold. State auto-saved.

### Files in Session
{files_list}

### Stats
- Tool calls: {state['toolCallCount']}
- Duplicates: {state.get('dupCount', 0)}
- Writes: {state.get('writeCount', 0)}
"""
    with open(cp_file, "w") as f:
        f.write(cp_content)

PYEOF
