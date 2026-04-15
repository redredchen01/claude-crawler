#!/bin/bash
set -e

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-demo}"
mkdir -p "$YD_MEMORY"
source ~/.zshrc-wrap

echo "👩‍💻 AGENT: Cursor (Frontend Developer)"
echo "📅 Day: 2"
echo "🎯 Task: Build login UI"
echo ""

# ============================================
# 1. Load Context
# ============================================
echo "1️⃣ Loading context from Codex..."

agent-context
echo ""

# ============================================
# 2. Check Task Status
# ============================================
echo "2️⃣ Checking available tasks..."

agent-tasks next
echo ""

# ============================================
# 3. Claim Frontend Task
# ============================================
echo "3️⃣ Claiming login UI task..."

agent-tasks claim "frontend-login" "cursor"

# ============================================
# 4. Read Codex's Progress
# ============================================
echo "4️⃣ Reading Codex's progress..."

agent-share read codex
echo ""

# ============================================
# 5. Build Login UI
# ============================================
echo "5️⃣ Building login UI..."

agent-decision log "auth-ui-flow" "Email → Password → Submit" << 'DECISION'
Simple form (no OAuth). Stores JWT tokens per Codex design.
Access token in memory (cleared on reload). Refresh token in httpOnly cookie.
DECISION

agent-decision log "token-storage" "Refresh token in httpOnly cookie, access token in memory" << 'DECISION'
Security best practice: prevents XSS from stealing refresh token.
Access token cleared on page reload = auto logout.
DECISION

# Simulate React development work
sleep 2
echo "   ✓ Login form component created"
echo "   ✓ Auth service integration complete"
echo "   ✓ Error handling implemented"
echo "   ✓ Loading states added"

agent-tasks done "frontend-login"

# ============================================
# 6. Publish Progress
# ============================================
echo "6️⃣ Publishing progress..."

agent-share write cursor << 'PROGRESS'
# Cursor Progress - Day 2 (Frontend)

## Completed ✅
✓ Login UI (React component)
- Email/password form
- Error handling
- Loading states
- Auto-focus on first field

## Implementation Details
- Form validation with joi schema
- Calls POST /auth/login from Codex's API
- Stores access token in memory
- Stores refresh token in httpOnly cookie via Set-Cookie header
- Auto-redirect to dashboard on successful login
- Shows 401 errors with helpful messages

## Key Decisions
- Refresh token in httpOnly cookie (server-only, XSS-safe)
- Access token in memory (cleared on page reload = auto logout)
- Auto-refresh when token expires (silent, no UX interruption)

## Next for Other Agents
Agent A: Can now test the /auth/login endpoint with the UI
Agent C: Can document the auth flow and response format

Frontend ready for integration testing!
PROGRESS

echo "   ✓ Progress published"

# ============================================
# 7. End Session
# ============================================
echo "7️⃣ Ending session..."

wrap "Cursor: Login UI complete and ready for integration with Codex's auth API."

echo ""
echo "✅ CURSOR SESSION COMPLETE"
echo ""
echo "Summary:"
echo "  - Tasks completed: 1/9"
echo "  - Decisions logged: 2"
echo "  - Progress shared: cursor-state.md"
echo ""
