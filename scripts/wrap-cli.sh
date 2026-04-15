#!/bin/bash

# Session Wrap CLI — Authentication & Cloud Sync
# Usage: wrap [login|logout|status|sync|history|help]

set -e

SESSION_WRAP_API_URL="${SESSION_WRAP_API_URL:-http://localhost:3000}"
SESSION_WRAP_TOKEN_FILE="$HOME/.session-wrap/token"
SESSION_WRAP_DIR="$HOME/.session-wrap"

# Create directory if needed
mkdir -p "$SESSION_WRAP_DIR"

# Detect agent type
detect_agent_type() {
  if [ -n "$CLAUDE_CODE_TOKEN" ]; then echo "claude-code"; return; fi
  if [ -n "$CURSOR_TOKEN" ]; then echo "cursor"; return; fi
  if [ -n "$WINDSURF_TOKEN" ]; then echo "windsurf"; return; fi
  if [ -n "$CLINE_TOKEN" ]; then echo "cline"; return; fi
  if [ -n "$AIDER_TOKEN" ]; then echo "aider"; return; fi
  echo "unknown"
}

# Login with agent token
cmd_login() {
  AGENT_TYPE=$(detect_agent_type)

  # Get token for agent type (works with bash and zsh)
  case "$AGENT_TYPE" in
    claude-code) AGENT_TOKEN="$CLAUDE_CODE_TOKEN" ;;
    cursor) AGENT_TOKEN="$CURSOR_TOKEN" ;;
    windsurf) AGENT_TOKEN="$WINDSURF_TOKEN" ;;
    cline) AGENT_TOKEN="$CLINE_TOKEN" ;;
    aider) AGENT_TOKEN="$AIDER_TOKEN" ;;
    *) AGENT_TOKEN="" ;;
  esac

  if [ -z "$AGENT_TOKEN" ]; then
    echo "❌ Error: No agent token found"
    echo ""
    echo "Set your agent token:"
    echo "  export CLAUDE_CODE_TOKEN=sk_..."
    echo "  export CURSOR_TOKEN=sk_..."
    echo "  export WINDSURF_TOKEN=sk_..."
    echo "  export CLINE_TOKEN=..."
    echo "  export AIDER_TOKEN=..."
    exit 1
  fi

  echo "🔐 Logging in with $AGENT_TYPE..."

  # Call backend login API
  RESPONSE=$(curl -s -X POST "$SESSION_WRAP_API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"claudeToken\": \"$AGENT_TOKEN\",
      \"agentType\": \"$AGENT_TYPE\"
    }")

  # Extract JWT token from response
  JWT_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

  if [ -z "$JWT_TOKEN" ]; then
    echo "❌ Login failed"
    echo "$RESPONSE"
    exit 1
  fi

  # Save token
  echo "$JWT_TOKEN" > "$SESSION_WRAP_TOKEN_FILE"
  chmod 600 "$SESSION_WRAP_TOKEN_FILE"

  echo "✅ Logged in successfully"
  echo "   Agent: $AGENT_TYPE"
  echo "   Token saved to: $SESSION_WRAP_TOKEN_FILE"
}

# Logout
cmd_logout() {
  if [ ! -f "$SESSION_WRAP_TOKEN_FILE" ]; then
    echo "⚠️  Not logged in"
    exit 0
  fi

  rm -f "$SESSION_WRAP_TOKEN_FILE"
  echo "✅ Logged out"
}

# Check login status
cmd_status() {
  if [ ! -f "$SESSION_WRAP_TOKEN_FILE" ]; then
    echo "❌ Not logged in"
    echo ""
    echo "Login: wrap login"
    exit 1
  fi

  JWT_TOKEN=$(cat "$SESSION_WRAP_TOKEN_FILE")
  AGENT_TYPE=$(detect_agent_type)

  RESPONSE=$(curl -s -X GET "$SESSION_WRAP_API_URL/api/users/profile" \
    -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null)

  if echo "$RESPONSE" | grep -q "error"; then
    echo "❌ Token expired or invalid"
    echo "Please login again: wrap login"
    rm -f "$SESSION_WRAP_TOKEN_FILE"
    exit 1
  fi

  echo "✅ Logged in"
  echo "   Agent: $AGENT_TYPE"
  echo "$RESPONSE" | grep -o '"[^"]*":"[^"]*"' | head -5
}

# View wrap history
cmd_history() {
  if [ ! -f "$SESSION_WRAP_TOKEN_FILE" ]; then
    echo "❌ Not logged in. Run: wrap login"
    exit 1
  fi

  JWT_TOKEN=$(cat "$SESSION_WRAP_TOKEN_FILE")

  RESPONSE=$(curl -s -X GET "$SESSION_WRAP_API_URL/api/wraps/history?limit=10" \
    -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null)

  echo "$RESPONSE" | grep -o '"summary":"[^"]*"' | head -10
}

# Help
cmd_help() {
  cat << 'HELP'
Session Wrap CLI — Cloud-enabled session management

Usage:
  wrap login              # Login with agent token
  wrap logout             # Logout
  wrap status             # Check login status
  wrap history            # View wrap history
  wrap help               # Show this help

Environment Variables:
  CLAUDE_CODE_TOKEN       # Claude Code subscription token
  CURSOR_TOKEN            # Cursor agent token
  WINDSURF_TOKEN          # Windsurf agent token
  CLINE_TOKEN             # Cline agent token
  AIDER_TOKEN             # Aider agent token
  SESSION_WRAP_API_URL    # Backend API URL (default: http://localhost:3000)

Examples:
  # Set your token
  export CLAUDE_CODE_TOKEN=sk_...

  # Login to cloud
  wrap login

  # Check status
  wrap status

  # View history
  wrap history

  # Logout when done
  wrap logout
HELP
}

# Parse command
COMMAND="${1:-help}"

case "$COMMAND" in
  login)   cmd_login ;;
  logout)  cmd_logout ;;
  status)  cmd_status ;;
  history) cmd_history ;;
  help|--help|-h)   cmd_help ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Run 'wrap help' for usage"
    exit 1
    ;;
esac
