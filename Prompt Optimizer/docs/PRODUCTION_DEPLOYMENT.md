# Prompt Optimizer — Production Deployment Guide

**Version:** 0.2.0 (Phase 8 complete)  
**Date:** 2026-04-13  
**Status:** Ready for production

---

## Pre-Deployment Checklist

### Environment & Configuration

- [ ] **Database Setup**
  - [ ] PostgreSQL instance created (not SQLite)
  - [ ] Database name and credentials secured in vault
  - [ ] Verify PostgreSQL version >= 12
  - [ ] Enable backups (daily, 30-day retention)

- [ ] **Environment Variables**
  ```bash
  # Required
  NEXTAUTH_SECRET=<random-string-generated-openssl-rand-base64-32>
  NEXTAUTH_URL=https://your-domain.com
  DATABASE_URL=postgresql://user:password@host:5432/prompt_optimizer
  NODE_ENV=production
  
  # Optional (with defaults)
  RATE_LIMIT_OPTIMIZE_PER_HOUR=10
  RATE_LIMIT_SCORE_PER_HOUR=30
  ```

- [ ] **TLS/SSL Certificates**
  - [ ] Domain registered and DNS configured
  - [ ] SSL certificate obtained (Let's Encrypt or CA)
  - [ ] Certificate auto-renewal configured

### Application Build & Testing

- [ ] **Build & Tests**
  ```bash
  npm run build          # Production build
  npm run test:ci        # All tests pass (186/186)
  npm run lint           # No linting errors
  ```
  - [ ] Build completes without errors
  - [ ] All 186 tests pass
  - [ ] No TypeScript errors
  - [ ] No console warnings

- [ ] **Code Review**
  - [ ] Recent commits reviewed
  - [ ] No secrets in code
  - [ ] Dependencies audited (`npm audit`)

### Database Migration

- [ ] **Pre-migration Backup**
  ```bash
  pg_dump -U postgres prompt_optimizer > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Schema Migration**
  ```bash
  npm run db:push        # Apply Prisma migrations
  ```
  - [ ] All migrations complete without errors
  - [ ] Tables created with correct structure
  - [ ] Indices created: (userId), (created_at), (userId, created_at)

- [ ] **Data Verification**
  - [ ] OptimizationRecord table ready
  - [ ] User table ready with role field
  - [ ] No constraint violations

### Security Hardening

- [ ] **Authentication & Authorization**
  - [ ] NextAuth.js secret generated and stored securely
  - [ ] Password hashing verified (bcryptjs, 10 rounds)
  - [ ] Session timeout set to 30 days
  - [ ] CSRF protection enabled

- [ ] **API Security**
  - [ ] CORS configured (restrict to known domains)
  - [ ] Rate limiting enabled:
    - [ ] optimize-full: 10/hour per user
    - [ ] score: 30/hour per user
  - [ ] Request ID logging enabled
  - [ ] X-RateLimit headers present in responses

- [ ] **Data Security**
  - [ ] Database passwords not in `.env` file (use secrets vault)
  - [ ] Database connections use SSL/TLS
  - [ ] Secrets rotated regularly
  - [ ] Access logs maintained

- [ ] **Input Validation**
  - [ ] Prompt length limits enforced (50,000 chars)
  - [ ] Batch size limits enforced (10 prompts/request)
  - [ ] Query length limits enforced (500 chars for search)
  - [ ] All endpoints validate input

### Performance & Monitoring

- [ ] **Performance Baseline**
  ```bash
  # Test endpoints with concurrent requests
  curl -X POST http://localhost:3000/api/score \
    -H "Content-Type: application/json" \
    -d '{"raw_prompt":"Test prompt"}' \
    -H "Authorization: Bearer <token>"
  ```
  - [ ] Response time < 2 seconds for single request
  - [ ] Batch endpoint handles 10 prompts < 15 seconds
  - [ ] Search endpoint handles 1000+ records < 1 second

- [ ] **Monitoring & Logging**
  - [ ] Pino logger configured for JSON output
  - [ ] Log aggregation service configured (e.g., ELK, DataDog)
  - [ ] Error alerts configured
  - [ ] Uptime monitoring enabled

- [ ] **Health Check**
  - [ ] GET /api/health endpoint responds with 200
  - [ ] Response includes version and database status
  - [ ] Health check monitored every 60 seconds

### Backup & Disaster Recovery

- [ ] **Backup Strategy**
  - [ ] Daily PostgreSQL backups scheduled
  - [ ] Backups stored in secure S3 bucket
  - [ ] Retention policy: 30 days
  - [ ] Restore procedure documented and tested

- [ ] **Disaster Recovery Plan**
  - [ ] Database failover procedure documented
  - [ ] RTO (Recovery Time Objective): < 1 hour
  - [ ] RPO (Recovery Point Objective): < 24 hours
  - [ ] Tested restore from backup

---

## Deployment Steps

### Step 1: Prepare Infrastructure

```bash
# 1. Create PostgreSQL database
createdb prompt_optimizer

# 2. Set production environment variables
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL=https://your-domain.com
export DATABASE_URL=postgresql://user:password@host:5432/prompt_optimizer
export NODE_ENV=production
```

### Step 2: Build Application

```bash
# 3. Install dependencies
npm install --production

# 4. Build TypeScript
npm run build

# 5. Run tests (final verification)
npm run test:ci
```

### Step 3: Database Setup

```bash
# 6. Run Prisma migrations
npm run db:push

# 7. Verify schema
npx prisma db execute --stdin < verify_schema.sql
```

### Step 4: Start Application

```bash
# 8. Start production server
npm run start

# 9. Verify health endpoint
curl http://localhost:3000/api/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-04-13T10:00:00Z",
#   "version": "0.2.0"
# }
```

### Step 5: Enable Monitoring

```bash
# 10. Configure log aggregation
# Point /var/log/app.log to your log service

# 11. Set up alerting
# Alert on: 5xx errors, rate limit exceeding 80%, response time > 3s
```

---

## Post-Deployment Validation

### Immediate Checks (First Hour)

- [ ] All endpoints respond with 200/expected status
- [ ] Health check passes
- [ ] Error logs clean (no 5xx errors)
- [ ] Rate limit headers present in responses
- [ ] Database writes successful

**Quick Test Script:**

```bash
#!/bin/bash
BASE_URL=https://your-domain.com

# Health check
curl -f $BASE_URL/api/health || echo "FAIL: Health check"

# Sample score request (with auth token)
curl -f -X POST $BASE_URL/api/score \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt":"Test"}' || echo "FAIL: Score API"

# Sample search (with auth token)
curl -f "$BASE_URL/api/user/search?q=test" \
  -H "Authorization: Bearer <token>" || echo "FAIL: Search API"

echo "✓ All basic checks passed"
```

### 24-Hour Monitoring

- [ ] No uncaught errors in logs
- [ ] Response times stable (< 2s average)
- [ ] Rate limiting working correctly (429 responses when limit hit)
- [ ] Database performance acceptable
- [ ] No memory leaks (heap stable)

### Weekly Validation

- [ ] Backup completion verified
- [ ] Restore procedure tested
- [ ] Performance metrics reviewed
- [ ] Security logs reviewed for anomalies

---

## Operational Procedures

### Scaling

**Horizontal Scaling (Multiple Instances):**
- Session state is JWT-based (stateless) ✓
- Database connections pooled (PgBouncer recommended)
- Rate limiting uses DB sliding window (shared across instances) ✓
- No local file storage (all to database) ✓

**Vertical Scaling:**
- Increase PostgreSQL connection pool if needed
- Adjust Node.js memory limits based on workload
- Enable read replicas for analytics queries

### Maintenance

**Regular Tasks:**
- [ ] Monthly security patches (Node.js, dependencies)
- [ ] Quarterly dependency updates
- [ ] Monthly backup restoration test
- [ ] Quarterly database optimization (ANALYZE, REINDEX)

**Emergency Procedures:**
- High error rate (> 5%): Check logs, restart if needed
- Database unavailable: Fail gracefully, return 503
- Rate limit exhaustion: Expected behavior, users wait 1 hour
- Memory issues: Restart node process, investigate memory leaks

### Rollback Procedure

```bash
# 1. Stop current process
pkill -f "npm run start"

# 2. Restore previous version
git checkout <previous-tag>
npm install
npm run build

# 3. Restore database (if schema changed)
psql prompt_optimizer < backup_$(date +%Y%m%d).sql

# 4. Restart
npm run start
```

---

## Monitoring Queries

### Database Health

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'prompt_optimizer';

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;

-- Check table size
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
```

### Application Health

```bash
# Check error rate (from logs)
grep "ERROR" /var/log/app.log | wc -l

# Check rate limit hits
grep "Rate limit exceeded" /var/log/app.log | wc -l

# Check response times
grep "duration_ms" /var/log/app.log | awk -F'"' '{print $4}' | sort -n | tail -20
```

---

## Performance Benchmarks

| Endpoint | Expected Response Time | Concurrent Users | Notes |
|----------|------------------------|------------------|-------|
| POST /api/score | < 1s | 100 | Single prompt scoring |
| POST /api/optimize-full | < 2s | 50 | Full optimization pipeline |
| POST /api/optimize-full/batch (10 prompts) | < 15s | 20 | Parallel processing |
| GET /api/user/search | < 1s | 100 | Indexed search |
| GET /api/user/history | < 500ms | 100 | Paginated query |

---

## Support & Escalation

**On-Call Runbook:**
1. Check health endpoint: `GET /api/health`
2. Review error logs: `grep "ERROR" /var/log/app.log | tail -50`
3. Check rate limit status: `grep "429" /var/log/app.log | wc -l`
4. Check database connectivity: `psql prompt_optimizer -c "SELECT 1"`
5. Restart if needed: `npm run start` (after confirming root cause)

**Escalation:**
- Database connectivity issue: Contact DBA
- Memory leak suspected: Collect heap dump and escalate
- Data corruption: Restore from backup (see Rollback Procedure)

---

## Version History

| Version | Release Date | Changes |
|---------|--------------|---------|
| 0.2.0 | 2026-04-13 | Phase 8: Rate limiting, batch API, full-text search |
| 0.1.2 | 2026-04-13 | Phase 7: Monitoring & observability, LLM optimization |
| 0.1.1 | 2026-04-10 | Phase 1-6: Core MVP features |
| 0.1.0 | 2026-04-01 | Initial MVP release |

---

## Contact & Documentation

- **Bug Reports:** GitHub Issues
- **Documentation:** `/docs`
- **API Docs:** README.md, OpenAPI spec (if available)
- **Performance Analysis:** Grafana dashboards (if configured)

---

**Last Updated:** 2026-04-13  
**Approved By:** [Engineering Team]  
**Next Review:** 2026-05-13
