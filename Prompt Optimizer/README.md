# Prompt Optimizer

A web application that optimizes prompts before sending them to AI agents. The system evaluates prompt quality, suggests improvements, and shows quantified score improvements. Features multi-user authentication, role-based access control (RBAC), comprehensive analytics dashboards, and production-grade reliability with timeout control and intelligent rate limit handling.

## Features

### Core
- **Prompt Quality Scoring (PQS):** 6-dimension scoring system (Specificity, Context, Output Spec, Runnability, Evaluation, Safety)
- **Automatic Optimization:** AI-powered prompt rewriting to address quality gaps
- **Side-by-Side Comparison:** View raw vs. optimized prompts with score deltas
- **User Authentication:** Email/password registration with secure bcryptjs hashing
- **Role-Based Access Control:** ADMIN and USER roles for fine-grained permissions
- **User Dashboards:** Personal optimization history with stats and trends
- **Admin Dashboard:** System-wide analytics, user management, and detailed metrics
- **Database Persistence:** SQLite (development) or PostgreSQL (production) with Prisma ORM

### Observability & Reliability
- **Health Check Endpoint:** `GET /api/health` for uptime monitoring and deployment health
- **Structured Logging:** Pino-based JSON logging with request correlation IDs for all API routes
- **LLM Call Instrumentation:** Automatic timing, token counting, and operation tracking
- **Timeout Control:** Per-call (30s) and pipeline-level (60s) timeouts prevent indefinite hangs
- **Intelligent Rate Limiting:** Automatic detection and graceful handling of API rate limits
- **Improved Retry Logic:** Exponential backoff with jitter for distributed resilience

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- SQLite (built-in for development) or PostgreSQL

### Setup

1. **Clone and install:**
   ```bash
   cd Prompt\ Optimizer
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add (optional for development):
   - `NEXTAUTH_SECRET`: Random string for JWT signing (generate with `openssl rand -base64 32`)
   - `NEXTAUTH_URL`: Auth callback URL (default: `http://localhost:3000`)
   - `DATABASE_URL`: Database connection string (uses SQLite by default in development)

3. **Setup database:**
   ```bash
   npm run db:push
   ```

4. **Start dev server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## API Endpoints

### Health & Status

#### GET `/api/health`
Health check endpoint for uptime monitoring (no authentication required).
```json
Response: {
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-04-13T12:00:00Z"
}
```

### Authentication

#### POST `/api/auth/register`
Register a new user account.
```json
Request: {
  "email": "user@example.com",
  "password": "securepassword",
  "confirmPassword": "securepassword"
}
Response: {
  "id": "user-123",
  "email": "user@example.com",
  "role": "USER",
  "message": "User created successfully"
}
```

#### GET/POST `/api/auth/[...nextauth]`
NextAuth.js handler for login, logout, and session management.

### Scoring & Optimization

#### POST `/api/score`
Score a raw prompt (requires authentication).
```json
Request: { "raw_prompt": "Write code" }
Response: {
  "total": 35,
  "dimensions": {
    "specificity": 5,
    "context": 5,
    "output_spec": 8,
    "runnability": 5,
    "evaluation": 5,
    "safety": 2
  },
  "missing_slots": ["task", "language"],
  "issues": "...",
  "diagnostics": "..."
}
```

#### POST `/api/optimize-full`
Full optimization pipeline: score → optimize → re-score → save (requires authentication).
```json
Request: { "raw_prompt": "Write code" }
Response: {
  "optimized_prompt": "...",
  "explanation": "...",
  "optimized_score": { ... },
  "score_delta": {
    "total_delta": 47,
    "dimension_deltas": { ... }
  }
}
```

#### GET `/api/demo`
Get example demo data (no authentication required, no LLM calls needed).

### User Routes

#### GET `/api/user/history`
Get current user's optimization history with stats (requires authentication).
```json
Request: ?limit=50
Response: {
  "records": [
    {
      "id": "record-123",
      "created_at": "2026-04-10T10:30:00Z",
      "raw_score": 45,
      "optimized_score": 65,
      "delta": 20
    }
  ],
  "stats": {
    "totalCount": 10,
    "avgRawScore": 42.5,
    "avgOptimizedScore": 62.3,
    "avgDelta": 19.8
  }
}
```

#### GET `/dashboard`
User dashboard page with history table and trends (requires USER or ADMIN role).

### Admin Routes (requires ADMIN role)

#### GET `/api/admin/users`
List all registered users.
```json
Response: {
  "users": [
    {
      "id": "user-123",
      "email": "user@example.com",
      "role": "USER",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### DELETE `/api/admin/users`
Delete a user (cannot delete your own account).
```json
Request: { "userId": "user-123" }
Response: {
  "message": "User deleted successfully",
  "user": { "id": "user-123", "email": "user@example.com" }
}
```

#### GET `/api/admin/stats`
Summary statistics for all users and optimizations.
```json
Response: {
  "stats": {
    "totalUsers": 10,
    "totalOptimizations": 150,
    "recordsByUser": [
      { "email": "user@example.com", "count": 15 }
    ]
  }
}
```

#### GET `/api/admin/analytics`
Detailed analytics with time-series, score distribution, and dimension averages.
```json
Request: ?days=30
Response: {
  "overview": {
    "totalUsers": 10,
    "totalOptimizations": 150,
    "avgRawScore": 42.5,
    "avgOptimizedScore": 62.3,
    "avgDelta": 19.8
  },
  "timeSeries": [
    { "date": "2026-04-10", "count": 5 },
    { "date": "2026-04-11", "count": 8 }
  ],
  "scoreDistribution": [
    { "bucket": "0-20", "count": 10 },
    { "bucket": "21-40", "count": 25 },
    ...
  ],
  "dimensionAverages": {
    "specificity": 8.5,
    "context": 7.8,
    "output_spec": 9.2,
    "runnability": 8.1,
    "evaluation": 7.2,
    "safety": 6.5
  },
  "topUsers": [
    { "email": "user@example.com", "count": 25 }
  ]
}
```

#### GET `/admin/dashboard`
Admin dashboard page with Recharts visualizations and user management (requires ADMIN role).

## Project Structure

```
app/
  api/                          # Next.js API routes
    auth/
      [...nextauth]/            # NextAuth.js handler
      register/                 # User registration
    score/
    optimize-full/
    demo/
    admin/
      users/                    # User management
      stats/                    # Summary stats
      analytics/                # Detailed analytics
    user/
      history/                  # User's optimization history
  admin/
    dashboard/                  # Admin dashboard (server component)
      DashboardClient.tsx       # Client-side charts
  dashboard/                    # User dashboard (server component)
    DashboardClient.tsx         # Client-side history table
  components/
    ScoreDisplay.tsx
    OptimizationResult.tsx
    LoadingSpinner.tsx
  page.tsx                      # Main landing page
  layout.tsx
  globals.css
  providers.tsx                 # SessionProvider wrapper

lib/
  auth.ts                       # NextAuth configuration & helpers
  rbac.ts                       # Role-based access control (requireAuth, requireAdmin)
  logger.ts                     # Pino logger singleton
  db.ts                         # Prisma client
  api-client.ts                 # Frontend API helpers
  llm/
    types.ts
    client.ts                   # Mock LLM implementation
    prompts.ts
  services/
    scoring.ts
    optimization.ts

prisma/
  schema.prisma                 # Database schema (User, OptimizationRecord, etc.)

middleware.ts                   # Route protection middleware

docs/                           # Documentation
README.md

__tests__/                      # Jest test suite
  api/
    auth/register.test.ts
    admin/users.test.ts
    admin/stats.test.ts
    admin/analytics.test.ts
    user/history.test.ts
  lib/
    rbac.test.ts
```

## Environment Variables

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `NEXTAUTH_SECRET` | JWT signing secret | Yes | Generated on first run |
| `NEXTAUTH_URL` | Auth callback URL | No | `http://localhost:3000` |
| `DATABASE_URL` | Database connection | No | SQLite in-memory (dev) |
| `NODE_ENV` | Environment | No | `development` |

## Authentication & Authorization

### Authentication Flow
1. User registers via `/api/auth/register` with email and password
2. Password is hashed with bcryptjs (10 rounds)
3. Session established via NextAuth.js with JWT strategy
4. User can log in via credentials provider
5. Session persists for 30 days

### Authorization (RBAC)
- **ADMIN:** Can access `/api/admin/*` routes, view analytics, manage users
- **USER:** Can access `/api/score`, `/api/optimize-full`, `/api/user/history`, user dashboard

Use `requireAuth()` for authenticated-only routes, `requireAdmin()` for admin-only routes.

## Development Commands

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests (watch mode)
npm run test:ci      # Run tests once (CI mode)
npm run lint         # Run linter
npm run db:push      # Apply schema to database
npm run db:studio    # Open Prisma Studio (visual DB editor)
npm run db:reset     # Reset database (destructive!)
```

## Testing

The project includes comprehensive Jest tests covering:
- User registration (validation, hashing, duplicate detection)
- Role-based access control (auth, admin permissions)
- API endpoints (RBAC enforcement, response shapes)
- User history (scoping, stats calculation)

Run all tests:
```bash
npm run test:ci
```

Run specific test suites:
```bash
npm run test:ci -- --testPathPattern="rbac|register"
npm run test:ci -- --testPathPattern="admin"
```

## Architecture Notes

### Authentication & RBAC
- NextAuth.js v4 with CredentialsProvider
- JWT session strategy with 30-day expiry
- Passwords hashed with bcryptjs (10 rounds salt)
- RBAC via `lib/rbac.ts` helpers (requireAuth, requireAdmin, isAdmin, isUser)
- Route protection via middleware.ts and per-endpoint guards

### Logging
- Pino logger (JSON-structured) configured in `lib/logger.ts`
- All API routes log with format: `{ route: "/api/path", duration_ms, status, error? }`
- Development: pretty-printed output; Production: JSON lines

### Data Persistence
- SQLite for development (no setup required)
- PostgreSQL for production
- Prisma ORM for type-safe queries
- JSON serialization for PQSScore objects (raw_score, optimized_score)
- All scores stored as JSON strings, parsed in route handlers

### Optimization Pipeline
- Scoring and optimization use deterministic mock LLM (no API key required)
- Scores calculated based on prompt content analysis
- Results persisted to OptimizationRecord with user_id for scoping
- Full pipeline wrapped with 60s timeout to prevent indefinite hangs
- Each LLM call protected with 30s timeout and automatic retry

### Resilience & Error Handling
- **Timeout Control:** Uses Promise.race to enforce deadlines
  - Per-call timeout: 30s (scorePrompt, optimizePrompt)
  - Pipeline timeout: 60s (complete optimization flow)
- **Rate Limit Handling:** Detects rate limits from multiple sources
  - HTTP 429 (Too Many Requests) status code
  - RateLimit-Remaining=0 header
  - Retry-After header (both seconds and HTTP-date formats)
  - RateLimit-Reset header for precise retry timing
- **Exponential Backoff:** Intelligent retry with jitter
  - Base delay: 2^retry × 1000ms (capped at 30s)
  - Jitter: 0.8-1.2× multiplier to avoid thundering herd
  - Max 3 retries per request

## Known Limitations

- LLM calls use deterministic mock implementation (no real API required for MVP)
- No batch processing API
- No custom scoring dimension configuration
- Single deployment (no multi-region)
- No user-level rate quotas (server-level resilience only)

## Roadmap

### Phase 7 (Current: Monitoring & Observability) ✅
- Health check endpoint for uptime monitoring
- Request correlation IDs for distributed tracing
- LLM call instrumentation with timing and token counting
- Timeout control (per-call and pipeline)
- Intelligent rate limit detection and handling

### Phase 8 (Planned Enhancements)
- Rate limiting and quota management per user
- Prompt history full-text search
- Batch scoring API for bulk optimization
- Custom dimension weighting per user
- A/B testing UI for optimization strategies
- Export to PDF/markdown
- Webhook integrations for external systems
- API key management for programmatic access
- Multi-region deployment support

## Troubleshooting

### "Authentication required"
- Ensure you're logged in
- Check that JWT token in session is valid
- Clear cookies and try logging in again

### "Admin access required"
- Only ADMIN users can access `/api/admin/*` routes
- Contact an admin to upgrade your role

### "User already exists"
- Email is already registered
- Try registering with a different email

### "Database connection failed"
- Check DATABASE_URL is set and valid
- Ensure database server is running
- For SQLite: file should be writable in project directory

### Port 3000 already in use
```bash
npm run dev -- -p 3001
```

## Contributing

See CONTRIBUTING.md (not included in MVP).

## License

MIT

---

**Version:** 0.1.2 (MVP + Phase 7 Monitoring & Unit 32 Reliability Improvements)

Built with Next.js 14, TypeScript, Prisma ORM, NextAuth.js, Recharts, and Pino Logger.
