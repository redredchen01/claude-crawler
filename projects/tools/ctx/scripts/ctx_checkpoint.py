#!/usr/bin/env python3
"""ctx checkpoint — manually create a context checkpoint."""

import json
import sys
from datetime import datetime
from pathlib import Path


def find_ctx_dir():
    p = Path.cwd()
    while p != p.parent:
        ctx = p / ".ctx"
        if ctx.exists():
            return ctx
        p = p.parent
    return Path.cwd() / ".ctx"


def load_state(ctx_dir):
    state_file = ctx_dir / "state.json"
    if not state_file.exists():
        return None
    return json.loads(state_file.read_text())


def main():
    summary = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Manual checkpoint"

    ctx_dir = find_ctx_dir()
    state = load_state(ctx_dir)

    if state is None:
        print("❌ No .ctx/state.json found.")
        sys.exit(1)

    pct = min(100, round(state["usedTokens"] / state["maxTokens"] * 100))
    thresholds = [(40, "green"), (60, "yellow"), (80, "orange"), (100, "red")]
    threshold = "red"
    for max_val, name in thresholds:
        if pct < max_val:
            threshold = name
            break

    now = datetime.now()
    ts = now.strftime("%Y%m%d-%H%M%S")
    filename = f"ctx-checkpoint-{ts}-manual.md"

    cp_dir = ctx_dir / "checkpoints"
    cp_dir.mkdir(parents=True, exist_ok=True)

    files_section = ""
    files = state.get("filesRead", [])
    if files:
        files_section = "\n### Key Files\n" + "\n".join(f"- {f['path']}" for f in files[-10:])

    content = f"""---
type: checkpoint
percentage: {pct}
threshold: {threshold}
timestamp: {now.isoformat()}
source: manual
---

## Checkpoint at {pct}%

{summary}
{files_section}

### Stats
- Files read: {len(files)}
- Duplicates: {state.get('dupCount', 0)}
- Tool calls: {state.get('toolCallCount', 0)}
- Responses: {state.get('responseCount', 0)}
"""

    (cp_dir / filename).write_text(content)
    print(f"✅ Checkpoint saved: .ctx/checkpoints/{filename}")
    print(f"   Context at ~{pct}% ({threshold})")


if __name__ == "__main__":
    main()
