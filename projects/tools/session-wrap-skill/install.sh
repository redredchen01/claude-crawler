#!/usr/bin/env bash
# session-wrap-skill installer (no Node.js required)
# Usage: curl -fsSL https://raw.githubusercontent.com/redredchen01/session-wrap-skill/main/install.sh | bash

set -euo pipefail

REPO="https://raw.githubusercontent.com/redredchen01/session-wrap-skill/main"
SKILL_URL="$REPO/SKILL.md"
TMPFILE=$(mktemp)

echo ""
echo "🧠 session-wrap-skill installer"
echo ""

# Download SKILL.md
curl -fsSL "$SKILL_URL" -o "$TMPFILE" || {
  echo "❌ Failed to download SKILL.md"
  exit 1
}

installed=0

# Claude Code
if [ -d "$HOME/.claude" ]; then
  dir="$HOME/.claude/skills/session-wrap"
  mkdir -p "$dir"
  cp "$TMPFILE" "$dir/SKILL.md"
  echo "  ✅ Claude Code → $dir/SKILL.md"
  installed=1
fi

# OpenClaw
if [ -d "$HOME/.openclaw" ]; then
  dir="$HOME/.openclaw/skills/session-wrap"
  mkdir -p "$dir"
  cp "$TMPFILE" "$dir/SKILL.md"
  echo "  ✅ OpenClaw → $dir/SKILL.md"
  installed=1
fi

# Cursor
if [ -d ".cursor" ]; then
  mkdir -p ".cursor/rules"
  cp "$TMPFILE" ".cursor/rules/session-wrap.mdc"
  echo "  ✅ Cursor → .cursor/rules/session-wrap.mdc"
  installed=1
fi

# Cline
if [ -d ".cline" ] || [ -f ".clinerules" ]; then
  mkdir -p ".cline/rules"
  cp "$TMPFILE" ".cline/rules/session-wrap.md"
  echo "  ✅ Cline → .cline/rules/session-wrap.md"
  installed=1
fi

# Roo Code
if [ -d ".roo" ] || [ -f ".roorules" ]; then
  mkdir -p ".roo/rules"
  cp "$TMPFILE" ".roo/rules/session-wrap.md"
  echo "  ✅ Roo Code → .roo/rules/session-wrap.md"
  installed=1
fi

# Gemini CLI
if [ -d "$HOME/.gemini" ] || [ -f "GEMINI.md" ]; then
  mkdir -p ".ai-memory"
  cp "$TMPFILE" ".ai-memory/SKILL.md"
  marker="# Auto-Memory (session-wrap)"
  if [ -f "GEMINI.md" ] && grep -q "$marker" "GEMINI.md" 2>/dev/null; then
    echo "  ✅ Gemini CLI → .ai-memory/ (bootstrap already in GEMINI.md)"
  else
    echo -e "\n$marker\nOn session start, read all .md files in .ai-memory/ directory for project context from previous sessions." >> "GEMINI.md"
    echo "  ✅ Gemini CLI → .ai-memory/ + GEMINI.md bootstrap"
  fi
  installed=1
fi

# Codex (AGENTS.md)
if [ -f "AGENTS.md" ]; then
  mkdir -p ".ai-memory"
  cp "$TMPFILE" ".ai-memory/SKILL.md"
  marker="# Auto-Memory (session-wrap)"
  if grep -q "$marker" "AGENTS.md" 2>/dev/null; then
    echo "  ✅ Codex → .ai-memory/ (bootstrap already in AGENTS.md)"
  else
    echo -e "\n$marker\nOn session start, read all .md files in .ai-memory/ directory for project context from previous sessions." >> "AGENTS.md"
    echo "  ✅ Codex → .ai-memory/ + AGENTS.md bootstrap"
  fi
  installed=1
fi

# Amp (AGENT.md)
if [ -f "AGENT.md" ]; then
  mkdir -p ".ai-memory"
  cp "$TMPFILE" ".ai-memory/SKILL.md"
  marker="# Auto-Memory (session-wrap)"
  if grep -q "$marker" "AGENT.md" 2>/dev/null; then
    echo "  ✅ Amp → .ai-memory/ (bootstrap already in AGENT.md)"
  else
    echo -e "\n$marker\nOn session start, read all .md files in .ai-memory/ directory for project context from previous sessions." >> "AGENT.md"
    echo "  ✅ Amp → .ai-memory/ + AGENT.md bootstrap"
  fi
  installed=1
fi

# Copilot
if [ -f ".github/copilot-instructions.md" ]; then
  mkdir -p ".ai-memory"
  cp "$TMPFILE" ".ai-memory/SKILL.md"
  marker="# Auto-Memory (session-wrap)"
  if grep -q "$marker" ".github/copilot-instructions.md" 2>/dev/null; then
    echo "  ✅ Copilot → .ai-memory/ (bootstrap already present)"
  else
    echo -e "\n$marker\nOn session start, read all .md files in .ai-memory/ directory for project context from previous sessions." >> ".github/copilot-instructions.md"
    echo "  ✅ Copilot → .ai-memory/ + .github/copilot-instructions.md bootstrap"
  fi
  installed=1
fi

# Fallback
if [ "$installed" -eq 0 ]; then
  echo "  No known AI agent detected."
  echo "  Installing to .ai-memory/ (universal fallback)..."
  mkdir -p ".ai-memory"
  cp "$TMPFILE" ".ai-memory/SKILL.md"
  echo "  ✅ Installed to .ai-memory/SKILL.md"
  echo ""
  echo "  Add to your agent's instructions:"
  echo '    "On session start, read all .md files in .ai-memory/ for prior context."'
fi

rm -f "$TMPFILE"
echo ""
echo "✨ Done! Say '收工' or 'wrap up' to save context at session end."
echo ""
