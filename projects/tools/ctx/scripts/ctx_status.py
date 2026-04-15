#!/usr/bin/env python3
"""ctx status — view context window state from terminal."""

import json
import sys
from pathlib import Path

ICONS = {"green": "🟢", "yellow": "🟡", "orange": "🟠", "red": "🔴"}
THRESHOLDS = [(40, "green"), (60, "yellow"), (80, "orange"), (100, "red")]


def find_ctx_dir():
    """Search for .ctx/ in cwd and parents."""
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


def threshold(pct):
    for max_val, name in THRESHOLDS:
        if pct < max_val:
            return name
    return "red"


def format_bar(pct, width=30):
    filled = int(width * pct / 100)
    return "█" * filled + "░" * (width - filled)


def main():
    ctx_dir = find_ctx_dir()
    state = load_state(ctx_dir)

    if state is None:
        print("\n  ❌ No .ctx/state.json found. Run your AI agent with ctx installed first.\n")
        sys.exit(1)

    pct = min(100, round(state["usedTokens"] / state["maxTokens"] * 100))
    t = threshold(pct)
    icon = ICONS[t]
    used_k = round(state["usedTokens"] / 1000)
    max_k = round(state["maxTokens"] / 1000)

    print(f"""
  {icon} ctx — Context Window Status
  {'─' * 40}

  Usage:  {format_bar(pct)} {pct}%
          {used_k}K / {max_k}K tokens

  Threshold:    {t} {icon}
  Files read:   {len(state.get('filesRead', []))}
  Duplicates:   {state.get('dupCount', 0)}
  Tool calls:   {state.get('toolCallCount', 0)}
  Responses:    {state.get('responseCount', 0)}
  Session:      {state.get('startedAt', 'unknown')}""")

    files = state.get("filesRead", [])
    if files:
        print(f"\n  {'─' * 40}")
        print(f"  {'File':<35} {'Lines':>6} {'Reads':>6}")
        print(f"  {'─' * 35} {'─' * 6} {'─' * 6}")
        for f in files[-15:]:  # last 15
            name = f["path"][-35:]
            print(f"  {name:<35} {f['lines']:>6} {f['readCount']:>5}x")
        if len(files) > 15:
            print(f"  ... and {len(files) - 15} more")

    # Checkpoints
    cp_dir = ctx_dir / "checkpoints"
    if cp_dir.exists():
        cps = sorted(cp_dir.glob("ctx-checkpoint-*.md"), reverse=True)
        emergencies = sorted(cp_dir.glob("ctx-emergency-*.md"), reverse=True)
        if cps or emergencies:
            print(f"\n  {'─' * 40}")
            print(f"  Checkpoints: {len(cps)}  |  Emergency saves: {len(emergencies)}")
            if cps:
                print(f"  Latest: {cps[0].name}")

    print()


if __name__ == "__main__":
    main()
