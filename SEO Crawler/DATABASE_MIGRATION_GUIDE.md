# Phase 9.1 - Database Migration Guide

## Overview

Migrate SEO Crawler from in-memory/SQLite storage to PostgreSQL with Drizzle ORM for production-ready persistence.

## Architecture

### Tables

| Table | Purpose | Records | Indexes |
|-------|---------|---------|---------|
| `users` | User accounts | 100s | email, username |
| `api_keys` | API authentication | 10s per user | user_id |
| `jobs` | Crawl jobs | 1000s | user_id, status, created_at |
| `results` | Keyword results | 100k+ | job_id, keyword |
| `webhooks` | Event subscriptions | 10s per user | user_id |
| `webhook_attempts` | Delivery history | 100k+ | webhook_id |
| `analysis_cache` | Analysis storage | 1k+ | job_id, analysis_type |
| `audit_log` | Action logging | 100k+ | user_id, created_at |

### Schema Design

- **Users**: Role-based (admin, editor, viewer)
- **API Keys**: Secure hash storage, auto-expiration support
- **Jobs**: Full lifecycle tracking (waiting → running → completed/failed)
- **Results**: Multi-source (google, bing, competitor) with scoring
- **Webhooks**: Event-driven with flexible filtering
- **Audit Log**: Complete action trail for compliance

## Setup Instructions

### 1. Prerequisites

```bash
# Install PostgreSQL 13+
brew install postgresql@15

# Start PostgreSQL server
brew services start postgresql@15

# Install Node dependencies (already done)
npm install pg drizzle-orm drizzle-kit
```

### 2. Create Database

```bash
# Create database
createdb seo_crawler

# Create user
psql -d seo_crawler -c "CREATE USER seo_crawler WITH PASSWORD 'secure-password';"

# Grant privileges
psql -d seo_crawler -c "GRANT ALL PRIVILEGES ON DATABASE seo_crawler TO seo_crawler;"
```

### 3. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your PostgreSQL credentials
cat .env
# DATABASE_URL=postgresql://seo_crawler:password@localhost:5432/seo_crawler
```

### 4. Initialize Schema

```bash
# Run migrations
npm run migrate

# OR manually run SQL
psql -d seo_crawler -f backend/src/db/migrations/0001_initial_schema.sql
```

### 5. Verify Installation

```bash
# Check tables created
psql -d seo_crawler -c "\dt"

# Expected output: 8 tables (users, api_keys, jobs, results, webhooks, webhook_attempts, analysis_cache, audit_log)
```

## Migration from In-Memory to PostgreSQL

### Data Migration Script

```bash
# Phase 1: Export in-memory data (if needed)
# Phase 2: Import to PostgreSQL
# Phase 3: Verify data integrity
# Phase 4: Update service layer to use DB
```

### Service Layer Updates

**Before (In-Memory):**
```javascript
const db = {
  jobs: new Map(),
  results: new Map(),
  webhooks: new Map(),
};
```

**After (PostgreSQL with Drizzle):**
```typescript
import { jobRepository } from './repositories/jobRepository';
import { webhookRepository } from './repositories/webhookRepository';

// Create job
const job = await jobRepository.createJob({ id, userId, seed, sources });

// Update status
await jobRepository.updateJobStatus(jobId, 'completed');

// Get results
const results = await jobRepository.getJobResults(jobId);
```

## API Endpoints (Updated)

### Job Management

```bash
# Create job (requires auth)
POST /api/jobs
Authorization: Bearer <token> | X-API-Key: <key>
Content-Type: application/json

{
  "seed": "seo optimization",
  "sources": ["google", "bing"],
  "competitorUrls": ["https://example.com"]
}

Response:
{
  "id": "job-123",
  "userId": 1,
  "status": "waiting",
  "createdAt": "2026-04-15T...",
  ...
}
```

```bash
# Get job details
GET /api/jobs/:id
Authorization: Bearer <token> | X-API-Key: <key>

Response:
{
  "id": "job-123",
  "status": "running",
  "resultCount": 42,
  "startedAt": "2026-04-15T...",
  ...
}
```

```bash
# List user's jobs
GET /api/jobs?page=1&pageSize=10
Authorization: Bearer <token> | X-API-Key: <key>

Response:
{
  "jobs": [...],
  "total": 150,
  "page": 1,
  "pageSize": 10
}
```

### User Management (Phase 9.2)

```bash
# Create user
POST /api/users
Content-Type: application/json

{
  "username": "john",
  "email": "john@example.com",
  "password": "secure-password",
  "role": "editor"
}
```

```bash
# Generate API key
POST /api/users/:userId/api-keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Production API Key",
  "expiresAt": "2027-04-15"
}

Response:
{
  "id": 1,
  "key": "sk_live_...",  // Only shown once!
  "name": "Production API Key",
  "createdAt": "2026-04-15T..."
}
```

## Performance Optimization

### Indexes

All tables have strategic indexes on:
- Foreign keys (user_id, job_id)
- Frequently queried columns (status, created_at)
- Full-text search candidates (normalized_keyword)

### Connection Pooling

- Max connections: 10 (configurable via DB_POOL_MAX)
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

### Query Optimization

Use Drizzle ORM's query builder for safe, optimized queries:

```typescript
// Good: Uses indexes, returns only needed columns
const jobs = await db
  .select({ id: jobs.id, status: jobs.status })
  .from(jobs)
  .where(eq(jobs.userId, userId))
  .orderBy(desc(jobs.createdAt))
  .limit(10);

// Avoid: SELECT * is inefficient
```

## Monitoring

### Health Check

```bash
curl http://localhost:3001/api/health
# Verifies database connectivity
```

### Database Queries

```bash
# Check active connections
psql -d seo_crawler -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Monitor slow queries (add to postgresql.conf)
log_min_duration_statement = 1000  # Log queries > 1s
```

## Backup & Recovery

### Backup

```bash
# Full backup
pg_dump seo_crawler > seo_crawler_backup.sql

# Compressed backup
pg_dump seo_crawler | gzip > seo_crawler_backup.sql.gz
```

### Restore

```bash
# From SQL file
psql seo_crawler < seo_crawler_backup.sql

# From compressed file
gunzip -c seo_crawler_backup.sql.gz | psql seo_crawler
```

## Migration Checklist

- [ ] PostgreSQL 13+ installed and running
- [ ] Database `seo_crawler` created
- [ ] User `seo_crawler` created with privileges
- [ ] `.env` file configured with DATABASE_URL
- [ ] Migrations run successfully (`npm run migrate`)
- [ ] All 8 tables exist in database
- [ ] Default admin user created
- [ ] Service layer updated to use repositories
- [ ] All tests passing with real DB
- [ ] Backup strategy configured
- [ ] Monitoring/logging configured

## Rollback Plan

If migration fails:

```bash
# 1. Drop all tables
dropdb seo_crawler

# 2. Recreate empty database
createdb seo_crawler

# 3. Restore from backup
psql seo_crawler < seo_crawler_backup.sql

# 4. Restart application with previous code version
```

## Troubleshooting

### Connection Refused

**Error:** `ECONNREFUSED 127.0.0.1:5432`

**Solution:**
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Start if needed
brew services start postgresql@15

# Test connection
psql -U seo_crawler -d seo_crawler -c "SELECT 1"
```

### Permission Denied

**Error:** `permission denied for schema public`

**Solution:**
```bash
# Grant privileges to user
psql -d seo_crawler -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO seo_crawler;"
```

### Migration Errors

**Error:** `Relation already exists`

**Solution:**
```bash
# Drop and recreate
dropdb seo_crawler
createdb seo_crawler
npm run migrate
```

## Next Steps

- **Phase 9.2**: Implement JWT authentication and RBAC
- **Phase 9.3**: Integrate real Claude API
- **Phase 9.4**: Add Prometheus monitoring

---

**Status:** ✅ Phase 9.1 Complete  
**Files:** 
- `backend/src/db/schema.ts` - Drizzle ORM schema
- `backend/src/db/client.ts` - Database client
- `backend/src/db/migrations/` - Migration scripts
- `backend/src/repositories/` - Service repositories

**Version:** 1.0
