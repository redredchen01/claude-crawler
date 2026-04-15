#!/usr/bin/env bash
# ctx — Context Window Manager installer (no Node.js required)
# Usage: curl -fsSL https://raw.githubusercontent.com/redredchen01/ctx/main/install.sh | bash

set -euo pipefail

REPO="https://raw.githubusercontent.com/redredchen01/ctx/main"
TMPFILE=$(mktemp)
TMPFULL=$(mktemp)

echo ""
echo "🧠 ctx — Context Window Manager"
echo ""

curl -fsSL "$REPO/SKILL.md" -o "$TMPFILE" || { echo "❌ Failed to download SKILL.md"; exit 1; }
curl -fsSL "$REPO/SKILL-full.md" -o "$TMPFULL" || { echo "❌ Failed to download SKILL-full.md"; exit 1; }

FULL=0
for arg in "$@"; do [ "$arg" = "--full" ] && FULL=1; done

installed=0

# OpenClaw
if [ -d "$HOME/.openclaw" ]; then
  dir="$HOME/.openclaw/skills/ctx"
  mkdir -p "$dir"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" "$dir/SKILL.md" || cp "$TMPFILE" "$dir/SKILL.md"
  echo "  ✅ OpenClaw → $dir/SKILL.md"
  installed=1
fi

# Claude Code
if [ -d "$HOME/.claude" ]; then
  dir="$HOME/.claude/skills/ctx"
  mkdir -p "$dir"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" "$dir/SKILL.md" || cp "$TMPFILE" "$dir/SKILL.md"
  echo "  ✅ Claude Code → $dir/SKILL.md"
  installed=1
fi

# Cursor
if [ -d ".cursor" ]; then
  mkdir -p ".cursor/rules"
  cp "$TMPFILE" ".cursor/rules/ctx.mdc"
  echo "  ✅ Cursor → .cursor/rules/ctx.mdc (always lite for 128K)"
  installed=1
fi

# Cline
if [ -d ".cline" ] || [ -f ".clinerules" ]; then
  mkdir -p ".cline/rules"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" ".cline/rules/ctx.md" || cp "$TMPFILE" ".cline/rules/ctx.md"
  echo "  ✅ Cline → .cline/rules/ctx.md"
  installed=1
fi

# Kilo Code
if [ -d ".kilo" ]; then
  mkdir -p ".kilo/rules"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" ".kilo/rules/ctx.md" || cp "$TMPFILE" ".kilo/rules/ctx.md"
  echo "  ✅ Kilo Code → .kilo/rules/ctx.md"
  installed=1
fi

# Roo Code
if [ -d ".roo" ] || [ -f ".roorules" ]; then
  mkdir -p ".roo/rules"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" ".roo/rules/ctx.md" || cp "$TMPFILE" ".roo/rules/ctx.md"
  echo "  ✅ Roo Code → .roo/rules/ctx.md"
  installed=1
fi

# Fallback
if [ "$installed" -eq 0 ]; then
  echo "  No AI agent detected. Installing to .ctx/ (universal fallback)..."
  mkdir -p ".ctx"
  [ "$FULL" -eq 1 ] && cp "$TMPFULL" ".ctx/SKILL.md" || cp "$TMPFILE" ".ctx/SKILL.md"
  echo "  ✅ Installed to .ctx/SKILL.md"
fi

# Always create checkpoint dir
mkdir -p ".ctx/checkpoints"
echo "  📁 Checkpoint dir: .ctx/checkpoints/"

rm -f "$TMPFILE" "$TMPFULL"
echo ""
echo "✨ Done! Your context window is now managed."
echo "   Lite: ~500 tokens overhead | Full (--full): ~1000 tokens"
echo ""
