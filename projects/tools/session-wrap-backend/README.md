# Session Wrap Backend — Cloud Sync + Analytics Dashboard

Complete cloud platform for session-wrap-skill. Multi-agent synchronization, role-based access control, analytics dashboards, and external integrations.

**Version:** 3.9.0 | **Status:** Production Ready | **Last Updated:** 2026-03-27

Supports Claude Code, Cursor, Windsurf, Cline, Aider, and other AI agents.

## Architecture

```
Agent Environment Variables (CLAUDE_CODE_TOKEN, CURSOR_TOKEN, etc.)
    ↓
session-wrap.sh (Local save + auto-detect agent)
    ↓
wrap-cli.sh (Cloud auth + sync)
    ↓
Backend API (Express.js + PostgreSQL)
    ├─ /api/auth/login         (Multi-agent login)
    ├─ /api/auth/verify        (JWT verification)
    ├─ /api/wraps              (Wrap storage)
    ├─ /api/wraps/history      (Wrap history)
    └─ /api/users/profile      (User data)
```

## Quick Start

### 1. Start Backend Locally

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend

# Install dependencies
npm install

# Start with Docker
docker-compose up -d

# Or start directly (requires PostgreSQL running separately)
npm run dev
```

Backend runs on `http://localhost:3000`
PostgreSQL runs on `localhost:5432`

### 2. Set Agent Token

```bash
# Claude Code
export CLAUDE_CODE_TOKEN=sk_...

# Or Cursor
export CURSOR_TOKEN=sk_...

# Or any other agent
export WINDSURF_TOKEN=sk_...
export CLINE_TOKEN=sk_...
export AIDER_TOKEN=sk_...
```

### 3. Login with wrap CLI

```bash
# From YD 2026 directory
source ~/YD\ 2026/.zshrc-wrap

# Login to cloud
wrap login

# Check status
wrap status

# View history
wrap history
```

## Features

### Multi-Agent Support

✅ **Supported Agents:**
- Claude Code
- Cursor
- Windsurf
- Cline
- Aider
- Continue.dev
- Copilot
- Any agent with token-based auth

### Auto-Detection

System auto-detects your agent based on:
1. Environment variables (CLAUDE_CODE_TOKEN, CURSOR_TOKEN, etc.)
2. User-agent header (if applicable)
3. Fallback to "unknown"

### Authentication Flow

```
1. wrap login
   ↓
2. Detect agent type (CLAUDE_CODE_TOKEN, CURSOR_TOKEN, etc.)
   ↓
3. Send token to /api/auth/login
   ↓
4. Backend verifies token with Claude API (Claude Code only)
   ↓
5. Return JWT token
   ↓
6. Store JWT in ~/.session-wrap/token
   ↓
7. Use JWT for subsequent API requests
```

### Wrap Synchronization

```
wrap "Feature complete"
   ↓
1. Save locally to MEMORY_DIR/session_YYYYMMDD_wrap.md
2. Sync Obsidian files
3. Create git checkpoint
4. If logged in: POST to /api/wraps
5. ✅ Done
```

## Environment Variables

### Backend (.env)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/session_wrap_db
NODE_ENV=development
PORT=3000
JWT_SECRET=your_super_secret_key
CLAUDE_CODE_API_URL=https://api.claude.ai
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Agent Tokens (in shell)

```bash
export CLAUDE_CODE_TOKEN=sk_...
export CURSOR_TOKEN=sk_...
export WINDSURF_TOKEN=sk_...
export CLINE_TOKEN=sk_...
export AIDER_TOKEN=sk_...
```

### API URL (optional)

```bash
export SESSION_WRAP_API_URL=http://localhost:3000
# For production: https://api.session-wrap.io
```

## API Endpoints

### POST /api/auth/login

Login with agent token.

**Request:**
```json
{
  "claudeToken": "sk_...",
  "agentType": "claude-code"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "login": "user",
    "email": "user@example.com"
  }
}
```

### POST /api/wraps

Save wrap to cloud.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
x-claude-token: <AGENT_TOKEN>
```

**Body:**
```json
{
  "workspaceName": "YD 2026",
  "summary": "Feature complete",
  "memorySize": 1024000,
  "obsidianFilesCount": 45,
  "metadata": {
    "agentType": "claude-code",
    "timestamp": "2026-03-26 12:00:00"
  }
}
```

### GET /api/wraps/history

Get wrap history.

**Query Parameters:**
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "wraps": [...],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### GET /api/users/profile

Get user profile and subscription status.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

## Database Schema

### users
- `id` (UUID, PK)
- `github_id` (VARCHAR, UNIQUE)
- `github_login` (VARCHAR)
- `email` (VARCHAR)
- `avatar_url` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

### claude_subscriptions
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `claude_token` (VARCHAR)
- `subscription_status` (VARCHAR)
- `verified_at`, `expires_at` (TIMESTAMP)

### session_wraps
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `workspace_name` (VARCHAR)
- `wrap_date` (TIMESTAMP)
- `summary` (TEXT)
- `memory_size` (BIGINT)
- `obsidian_files_count` (INT)
- `metadata` (JSONB)
- `s3_path` (VARCHAR)
- `created_at`, `updated_at` (TIMESTAMP)

### api_tokens
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `token` (VARCHAR, UNIQUE)
- `name` (VARCHAR)
- `last_used_at`, `expires_at` (TIMESTAMP)

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

### Initialize Database

```bash
npm run db:init
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down
```

## Deployment

### Railway (Recommended)

1. Connect GitHub repo
2. Create new project
3. Select this repository
4. Add environment variables from .env.example
5. Deploy

### Render

1. Create new Web Service
2. Connect GitHub
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables

### Self-Hosted

```bash
# Build Docker image
docker build -t session-wrap-backend .

# Run with PostgreSQL
docker run -e DATABASE_URL=postgresql://... -p 3000:3000 session-wrap-backend
```

## Troubleshooting

### Docker daemon not running

```bash
# macOS with Orbstack
orbstack start

# macOS with Docker Desktop
open /Applications/Docker.app
```

### PostgreSQL connection error

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart db

# Check logs
docker-compose logs db
```

### Token verification fails

1. Check if token is valid: `echo $CLAUDE_CODE_TOKEN`
2. Verify backend can reach Claude API: `curl https://api.claude.ai/user/profile -H "Authorization: Bearer $CLAUDE_CODE_TOKEN"`
3. Check backend logs: `docker-compose logs backend`

## Security

- JWT tokens stored in `~/.session-wrap/token` (chmod 600)
- Database connections use SSL in production
- Agent tokens validated against respective APIs
- No agent tokens stored in database (only verified subscriptions)

## Architecture Decisions

| Decision | Reason |
|----------|--------|
| **Multi-agent** | Support all AI agents, not just Claude Code |
| **Token-based auth** | Simple, scalable, works with all agents |
| **PostgreSQL** | Open-source, reliable, JSON support |
| **Express.js** | Lightweight, fast, great npm ecosystem |
| **Docker Compose** | Easy local dev, production-ready setup |
| **JWT tokens** | Stateless, secure, good for APIs |

## Phase 7-9 Features (New)

### Phase 7: Interactive Dashboard
- **Real-time WebSocket Sync** - Bidirectional updates across clients
- **Task CRUD** - Full create, read, update, delete operations from UI
- **Decision Search** - Full-text search with filtering
- **Team Collaboration** - Activity feed, comments, @mentions

### Phase 8: Enterprise Features
- **RBAC System** - admin, editor, viewer roles with fine-grained permissions
- **Analytics Dashboard** - KPIs, trends, agent leaderboards (7/30/90-day views)
- **External Integrations** - Slack, GitHub, Jira sync
- **Multi-tenant Workspaces** - Isolated data per workspace
- **Redis Caching** - Optional in-memory cache (5 min tasks, 1 hr analytics)

### Phase 9: Frontend + Optimization (Latest)
- **React 18 Dashboard** - Modern responsive UI
- **Component Memoization** - React.memo for performance
- **E2E Testing** - Playwright multi-browser tests
- **Frontend-Backend Integration** - Express static serving for React builds
- **Performance Optimization** - Lazy loading, chart optimization

## New Documentation

- **[API Documentation](docs/API.md)** - Complete REST API reference
- **[Component Guide](docs/COMPONENTS.md)** - React component documentation
- **[Development Guide](docs/DEVELOPMENT.md)** - Full development workflow
- **[CHANGELOG](CHANGELOG.md)** - Version history and release notes

## Frontend (React Dashboard)

Access the dashboard at `http://localhost:3000` (after running `npm run dev` in backend).

Frontend is served as static files from Express after `web/npm run build`.

### Key Pages
- **Home** - Welcome dashboard with quick stats
- **Analytics** - Metrics, trends, agent leaderboards
- **Workspaces** - Multi-tenant workspace management
- **Roles** - Member and role management
- **Integrations** - Slack, GitHub, Jira setup
- **Settings** - Account and preferences

### Testing
```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend/web
npm test                    # Unit tests (Vitest)
npm run test:e2e           # E2E tests (Playwright)
npm run test:coverage      # Coverage report
```

---

## Next Steps

- [x] Phase 7: Interactive Dashboard (Complete)
- [x] Phase 8: Enterprise Features (Complete)
- [x] Phase 9: Frontend-Backend Integration (Complete)
- [ ] Phase 10: Advanced Analytics (Planned)
- [ ] Phase 11: Team Management (Planned)
- [ ] Deploy to production
- [ ] Expand agent integrations

---

**Status:** Production Ready (v3.9.0)
**Last Updated:** 2026-03-27
