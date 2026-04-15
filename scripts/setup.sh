#!/bin/bash

# Session Wrap Setup Script — One-command project initialization
# Usage: bash setup.sh [--no-git]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Session Wrap Setup — One-command Initialization${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1/5: Checking prerequisites...${NC}"

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 not found${NC}"
    return 1
  fi
  echo -e "${GREEN}✓ $1${NC}"
  return 0
}

all_good=true
check_command "bash" || all_good=false
check_command "git" || all_good=false

if [ "$all_good" = false ]; then
  echo -e "${RED}✗ Prerequisites missing. Install bash and git, then try again.${NC}"
  exit 1
fi

echo ""

# Step 2: Create memory directory structure
echo -e "${YELLOW}Step 2/5: Creating memory directory structure...${NC}"

SLUG=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "project")
MEMORY_DIR="$HOME/.claude/projects/-$(echo "$SLUG" | tr '/' '-')/memory"

mkdir -p "$MEMORY_DIR"/{decisions,knowledge,checkpoints,agents,tasks} 2>/dev/null || true
echo -e "${GREEN}✓ Memory directories created${NC}"
echo "  Location: $MEMORY_DIR"

echo ""

# Step 3: Source .zshrc-wrap and verify aliases
echo -e "${YELLOW}Step 3/5: Setting up shell aliases...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.zshrc-wrap" ]; then
  echo -e "${GREEN}✓ .zshrc-wrap found${NC}"
  echo ""
  echo "Add this to your ~/.zshrc to activate aliases:"
  echo -e "${BLUE}  source $PROJECT_ROOT/.zshrc-wrap${NC}"
  echo ""
  echo "Then reload your shell:"
  echo -e "${BLUE}  exec zsh${NC}"
else
  echo -e "${RED}✗ .zshrc-wrap not found${NC}"
  exit 1
fi

echo ""

# Step 4: Initialize knowledge base with defaults
echo -e "${YELLOW}Step 4/5: Initializing knowledge base...${NC}"

# Create MEMORY.md index if it doesn't exist
if [ ! -f "$MEMORY_DIR/MEMORY.md" ]; then
  cat > "$MEMORY_DIR/MEMORY.md" << 'EOF'
# Project Memory Index

## Project Context
- Add project vision, architecture, conventions here
- Use: `agent-knowledge set conventions "..."`

## Sessions
- Session wraps captured automatically with `wrap`

## Decisions
- Important decisions logged with reasoning
- Use: `agent-decision log "topic" "decision" "reasoning"`

## Knowledge Base
- Project conventions
- Architecture overview
- Tech stack
- Common patterns

## Tasks
- Active tasks tracked with dependencies
- Use: `agent-tasks add "id" "description"`

## Cross-Agent Memory
- Agent states published via `agent-share write`

---

Run `agent-context` to load your project context automatically.
EOF
  echo -e "${GREEN}✓ Memory index created${NC}"
else
  echo -e "${GREEN}✓ Memory index exists${NC}"
fi

# Create sample knowledge base entries
if [ ! -f "$MEMORY_DIR/knowledge/conventions.md" ]; then
  mkdir -p "$MEMORY_DIR/knowledge"
  cat > "$MEMORY_DIR/knowledge/conventions.md" << 'EOF'
# Project Conventions

## Code Style
- Use clear, readable code
- Comment complex logic
- Write tests

## Documentation
- README with quickstart
- Architecture overview
- How-to guides

## Git
- Clear commit messages
- Feature branches
- Code review before merge
EOF
  echo -e "${GREEN}✓ Sample conventions created${NC}"
fi

if [ ! -f "$MEMORY_DIR/knowledge/architecture.md" ]; then
  cat > "$MEMORY_DIR/knowledge/architecture.md" << 'EOF'
# Project Architecture

## Overview
Document your project's architecture here.

## Components
- Core systems
- External dependencies
- Data flow

## Deployment
- How to deploy
- Environments
- Monitoring
EOF
  echo -e "${GREEN}✓ Sample architecture created${NC}"
fi

echo ""

# Step 5: Verify installation
echo -e "${YELLOW}Step 5/5: Verifying installation...${NC}"

if [ ! -d "$MEMORY_DIR" ]; then
  echo -e "${RED}✗ Memory directory not created${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Memory directory ready${NC}"

if [ -f "$PROJECT_ROOT/.zshrc-wrap" ]; then
  echo -e "${GREEN}✓ Shell aliases available${NC}"
fi

if [ -f "$MEMORY_DIR/MEMORY.md" ]; then
  echo -e "${GREEN}✓ Knowledge base initialized${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Next steps:"
echo ""
echo "1. Activate aliases in your shell:"
echo -e "   ${BLUE}source $PROJECT_ROOT/.zshrc-wrap${NC}"
echo ""
echo "2. Reload your shell:"
echo -e "   ${BLUE}exec zsh${NC}"
echo ""
echo "3. Load project context:"
echo -e "   ${BLUE}agent-context${NC}"
echo ""
echo "4. Start working:"
echo -e "   ${BLUE}agent-knowledge set conventions \"Your conventions\"${NC}"
echo -e "   ${BLUE}agent-tasks add \"first-task\" \"Description\"${NC}"
echo ""
echo "Documentation:"
echo "  README.md — Overview and features"
echo "  docs/QUICKSTART-EXAMPLES.md — Copy-paste examples"
echo "  docs/AGENT-WORKFLOW.md — Workflow patterns"
echo ""
echo "All set! 🚀"
echo ""
