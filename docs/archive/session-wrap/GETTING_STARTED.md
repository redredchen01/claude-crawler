# Session Wrap — Getting Started

## What You Just Received

Complete multi-agent session management system with cloud backend:

✅ **Backend API** — Express.js + PostgreSQL  
✅ **CLI Tools** — Local save + cloud sync  
✅ **Documentation** — 3 guides + full API docs  
✅ **Database** — 5 tables, schema ready  
✅ **Docker** — One-command local setup  

## Start in 3 Steps

### Step 1: Start Docker

```bash
# Choose one:

# Option A: Orbstack (faster)
open /Applications/Orbstack.app

# Option B: Docker Desktop
open /Applications/Docker.app
```

Wait for Docker to fully start (~30 seconds).

### Step 2: Start Backend

```bash
cd ~/YD\ 2026/session-wrap-backend
docker-compose up -d

# Verify it's running
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Step 3: Test CLI

```bash
# Set your agent token
export CLAUDE_CODE_TOKEN=sk_...

# Load CLI
source ~/.zshrc-wrap

# Login
wrap login

# Test save
wrap "First wrap test"

# View history
wrap history
```

## What's Working Right Now

### Local (No Docker Needed)
```bash
# Save session locally
wrap "Feature complete"

# This automatically:
# 1. Saves to MEMORY_DIR/session_YYYYMMDD_wrap.md
# 2. Syncs Obsidian files
# 3. Creates git checkpoint
```

### Cloud (Requires Docker)
```bash
# After docker-compose up -d
wrap login          # Authenticate
wrap status         # Check login
wrap "Feature done" # Auto-syncs to cloud
wrap history        # View cloud history
```

## File Structure

```
Your working directory:
~/YD 2026/
├── session-wrap.sh          ← Main command (uses both local + cloud)
├── wrap-cli.sh              ← Cloud authentication
├── .zshrc-wrap              ← Aliases & functions
├── obsidian/                ← Knowledge base
│
└── session-wrap-backend/    ← Cloud backend
    ├── src/                 ← Express server code
    ├── docker-compose.yml   ← Local environment
    ├── .env                 ← Configuration
    └── package.json         ← Dependencies (already installed)

Memory:
~/.claude/projects/-Users-dex-YD-2026/memory/
├── MEMORY.md                ← Index
└── backend_implementation_phase3.md ← Progress
```

## Key Commands

```bash
# Session management (always works)
wrap                        # Save session
wrap "Summary"              # Save with note
sync-kb                     # Sync knowledge base
mem                         # View memory
kb                          # Open knowledge base

# Cloud operations (needs backend running)
wrap login                  # Login with agent token
wrap logout                 # Logout
wrap status                 # Check status
wrap history                # View cloud history
```

## Multi-Agent Support

Just set the environment variable for your agent:

```bash
# Claude Code
export CLAUDE_CODE_TOKEN=sk_...

# Cursor
export CURSOR_TOKEN=sk_...

# Windsurf
export WINDSURF_TOKEN=sk_...

# Cline
export CLINE_TOKEN=sk_...

# Aider
export AIDER_TOKEN=sk_...
```

System auto-detects which agent you're using.

## Documentation

### Quick Reference
- **This file** — Getting started guide
- `SESSION-WRAP-QUICKSTART.md` — 5-minute overview
- `FINAL_CHECKLIST.md` — What's completed

### Full Guides
- `session-wrap-backend/README.md` — Complete API documentation
- `session-wrap-backend/SKILL.md` — Skill definition

### Memory System
- `~/.claude/projects/-Users-dex-YD-2026/memory/MEMORY.md` — Index
- `~/.claude/projects/-Users-dex-YD-2026/memory/backend_implementation_phase3.md` — Current progress

## Testing Checklist

After Docker starts:

- [ ] Health check: `curl http://localhost:3000/health`
- [ ] Login: `wrap login`
- [ ] Status: `wrap status`
- [ ] Save: `wrap "Test wrap"`
- [ ] History: `wrap history`
- [ ] Logout: `wrap logout`

## Deployment

When ready for production:

1. **Railway** (recommended):
   ```bash
   # Connect GitHub repo
   # Add .env variables
   # Deploy
   ```

2. **Render**:
   ```bash
   # Create web service
   # Connect GitHub
   # Deploy
   ```

See `session-wrap-backend/README.md` for full instructions.

## Troubleshooting

### Docker not starting
```bash
# Check if daemon is actually running
docker ps

# If not, manually start:
open /Applications/Orbstack.app
# Wait 30 seconds, then try again
```

### Backend won't connect
```bash
# Check if container is running
docker-compose ps

# View logs
docker-compose logs backend

# Restart
docker-compose restart backend
```

### Token verification fails
```bash
# Check token is set
echo $CLAUDE_CODE_TOKEN

# Test token validity
curl https://api.claude.ai/user/profile -H "Authorization: Bearer $CLAUDE_CODE_TOKEN"
```

## Architecture Overview

```
You
  ↓
wrap "Summary"
  ├─ Local Save ✅
  │  ├─ MEMORY_DIR/session_*.md
  │  ├─ Obsidian sync
  │  └─ Git checkpoint
  │
  └─ Cloud Sync (if logged in)
     ├─ JWT Token (from wrap login)
     ├─ Agent Type Detection
     └─ POST to /api/wraps
        └─ PostgreSQL Database
```

## What Makes This Different

✅ **Multi-Agent** — Works with any AI agent, not just Claude Code  
✅ **Free** — 100% open source, no paid tier  
✅ **Local First** — All functionality works offline  
✅ **Optional Cloud** — Cloud sync only if you login  
✅ **Simple** — Just set env var + run wrap command  

## Next Steps

1. **Now**: Start Docker when ready
2. **Then**: Run the test checklist
3. **Later**: Deploy to production (optional)

---

**Ready to test?** Start Docker and run:
```bash
wrap login
wrap status
wrap "Testing session-wrap"
```

**Questions?** Check the docs:
- `session-wrap-backend/README.md` — API details
- `session-wrap-backend/SKILL.md` — Skill definition
- `SESSION-WRAP-QUICKSTART.md` — Quick reference

**Status**: ✅ Implementation Complete  
**Docker Status**: ⏳ Waiting for you to start  
**Ready to Test**: As soon as Docker starts

Last updated: 2026-03-26
