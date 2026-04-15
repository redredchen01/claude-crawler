# PostgreSQL Migration Checklist

**Migration Date:** 2026-04-14  
**Status:** Ready to Execute  
**Estimated Duration:** 15-30 minutes

---

## Pre-Migration

- [ ] **Database Backup**
  - [ ] Backup SQLite database: `cp prisma/dev.db prisma/dev.db.backup`
  - [ ] Verify backup file exists and is readable
  - [ ] Store backup in safe location (external drive)

- [ ] **Documentation Review**
  - [ ] Read `docs/POSTGRES_MIGRATION_EXECUTION.md`
  - [ ] Read `docs/PHASE17_MIGRATION_VERIFICATION.md`
  - [ ] Understand rollback procedure

- [ ] **Environment Setup**
  - [ ] Docker Desktop installed and running
  - [ ] `docker-compose -v` returns version
  - [ ] Node.js 18+ installed
  - [ ] npm packages up to date

- [ ] **Test Current State**
  - [ ] `npm run test:ci` passes with SQLite (baseline)
  - [ ] Document test results: `___ tests passing`

---

## Migration Execution (Automated)

### Option A: Automated Script (Recommended)

```bash
# Run automated migration script
./scripts/migrate-to-postgres.sh
```

**The script will:**
- ✅ Check prerequisites
- ✅ Start PostgreSQL containers
- ✅ Create database
- ✅ Run Prisma migration
- ✅ Verify schema
- ✅ Run tests
- ✅ Optional: Run performance benchmark

**Checklist:**
- [ ] Script runs without errors
- [ ] All 6 steps complete successfully
- [ ] Test suite passes (471+)

---

## Migration Execution (Manual)

### Step 1: Start PostgreSQL

```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Verification:**
- [ ] All containers started: `docker-compose ps`
- [ ] PostgreSQL healthy: `docker exec prompt-optimizer-postgres pg_isready -U postgres`

### Step 2: Create Database

```bash
docker exec prompt-optimizer-postgres \
  psql -U postgres -c "CREATE DATABASE prompt_optimizer;"
```

**Verification:**
- [ ] Database created: `docker exec prompt-optimizer-postgres psql -U postgres -l | grep prompt_optimizer`

### Step 3: Run Migration

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"
npx prisma migrate deploy
```

**Verification:**
- [ ] Migration applies without error
- [ ] Output shows: "Your database is now in sync with your schema"

### Step 4: Verify Schema

```bash
docker exec prompt-optimizer-postgres \
  psql -U postgres -d prompt_optimizer -c "\dt"
```

**Verification:**
- [ ] List shows 13+ tables
- [ ] Expected tables present:
  - [ ] User
  - [ ] Team
  - [ ] TeamMember
  - [ ] ApiKey
  - [ ] WebhookConfig
  - [ ] AuditLog
  - [ ] OptimizationRecord
  - [ ] BatchOptimizationJob

### Step 5: Run Tests

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer" \
  npm run test:ci
```

**Verification:**
- [ ] Tests pass: `471+ tests passing`
- [ ] No connection errors in output
- [ ] Summary shows: `31+ test suites passed`

### Step 6: Seed Test Data (Optional)

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer" \
  npm run db:seed
```

**Verification:**
- [ ] Seed completes without error
- [ ] Data inserted: `docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer -c "SELECT COUNT(*) FROM \"User\";"`

---

## Data Migration (If Migrating from Existing Data)

### Export SQLite Data

```bash
DATABASE_URL="file:./prisma/dev.db" \
  npx ts-node scripts/migrate-data-sqlite-to-postgres.ts
```

**Verification:**
- [ ] Script completes with "Migration completed!"
- [ ] Backup created: `ls -la prisma/dev.db.backup`
- [ ] All tables show: "✅ [count] → [count]"

### Verify Data Integrity

```bash
# Check row counts
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;"
docker exec prompt-optimizer-postgres \
  psql -U postgres -d prompt_optimizer -c "SELECT COUNT(*) FROM \"User\";"
```

**Verification:**
- [ ] Row counts match between SQLite and PostgreSQL
- [ ] All foreign key constraints intact
- [ ] Tests pass with migrated data

---

## Post-Migration Configuration

### Update Environment Files

#### Option A: .env.local

```bash
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"
ANTHROPIC_API_KEY="your-api-key"
NEXTAUTH_SECRET="your-secret"
EOF
```

#### Option B: .env

```bash
# Edit .env and update:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"
```

**Verification:**
- [ ] `echo $DATABASE_URL` shows PostgreSQL URL
- [ ] `.env` or `.env.local` updated

### Update npm Scripts (Optional)

Add to `package.json`:
```json
{
  "scripts": {
    "db:postgres:start": "docker-compose -f docker-compose.dev.yml up -d",
    "db:postgres:stop": "docker-compose -f docker-compose.dev.yml down",
    "db:postgres:logs": "docker-compose -f docker-compose.dev.yml logs postgres"
  }
}
```

**Verification:**
- [ ] `npm run db:postgres:start` works
- [ ] `npm run db:postgres:logs` shows output

---

## Verification & Testing

### Test Suite Verification

```bash
# Run full test suite
npm run test:ci
```

**Checklist:**
- [ ] All tests pass (471+)
- [ ] No database connection errors
- [ ] No deprecation warnings

### API Testing

```bash
# Start dev server
npm run dev

# Test endpoints in another terminal
curl http://localhost:3000/api/health
curl http://localhost:3000/api/metrics
```

**Verification:**
- [ ] Health endpoint returns 200 OK
- [ ] Metrics endpoint returns Prometheus format
- [ ] No connection timeouts

### Performance Benchmark

```bash
npm run test:load
```

**Verification:**
- [ ] Benchmark completes successfully
- [ ] Latencies: < 50ms for cached queries
- [ ] Throughput: > 100 req/s

### Load Testing

```bash
# Simulate concurrent users
# Using Apache Bench or similar
ab -n 1000 -c 50 http://localhost:3000/api/health
```

**Verification:**
- [ ] No failed requests under load
- [ ] Response time < 100ms (p95)
- [ ] CPU/memory stable

---

## Monitoring Setup

### Enable Query Logging

```bash
docker exec prompt-optimizer-postgres \
  psql -U postgres -d prompt_optimizer -c \
  "ALTER SYSTEM SET log_min_duration_statement = 1000;"

docker exec prompt-optimizer-postgres \
  psql -U postgres -c "SELECT pg_reload_conf();"
```

**Verification:**
- [ ] Logs show slow queries (>1s)

### Monitor Logs

```bash
# PostgreSQL logs
docker-compose logs -f postgres

# Application logs
npm run dev  # Shows logs in console
```

**Verification:**
- [ ] No ERROR level messages
- [ ] No connection warnings
- [ ] Application responsive

---

## Rollback Plan (If Needed)

### Quick Rollback to SQLite

```bash
# 1. Stop PostgreSQL
docker-compose -f docker-compose.dev.yml down

# 2. Switch back to SQLite in prisma/schema.prisma:
# datasource db {
#   provider = "sqlite"
#   url      = env("DATABASE_URL")
# }

# 3. Restore environment
unset DATABASE_URL
# Or export DATABASE_URL="file:./prisma/dev.db"

# 4. Verify SQLite still works
npm run test:ci

# 5. Keep backup safe
# cp prisma/dev.db.backup prisma/dev.db  # if needed
```

**Verification:**
- [ ] SQLite tests pass
- [ ] All data intact from backup

### Data Recovery

```bash
# If data was lost, restore from backup
cp prisma/dev.db.backup prisma/dev.db
npm run test:ci
```

**Verification:**
- [ ] Backup restored
- [ ] Tests pass with original data

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] All development tests pass
- [ ] Production PostgreSQL instance created
- [ ] Connection string verified
- [ ] Firewall rules configured
- [ ] Backup strategy in place
- [ ] Monitoring configured

### Deployment Steps

- [ ] Schedule maintenance window
- [ ] Backup production SQLite
- [ ] Create production PostgreSQL database
- [ ] Export production data
- [ ] Run migration: `prisma migrate deploy`
- [ ] Import data: `migrate-data-sqlite-to-postgres.ts`
- [ ] Verify data integrity
- [ ] Test application endpoints
- [ ] Monitor for 24 hours
- [ ] Document any issues

### Post-Deployment

- [ ] Monitor database logs daily
- [ ] Track performance metrics
- [ ] Validate user reports
- [ ] Prepare rollback procedure
- [ ] Archive migration documentation
- [ ] Update README with PostgreSQL setup

---

## Support & Troubleshooting

### Common Issues

**PostgreSQL Connection Refused**
```bash
# Check containers are running
docker-compose -f docker-compose.dev.yml ps

# Check logs
docker-compose logs postgres

# Verify credentials and port
psql -h localhost -U postgres -d prompt_optimizer
```

**Migration Already Applied**
```bash
# Check status
npx prisma migrate status

# If stuck, mark as resolved
npx prisma migrate resolve --rolled-back 1776154364506_init_postgresql
```

**Schema Mismatch**
```bash
# Compare schemas
npx prisma db push --force-reset  # WARNING: Destructive!

# Or create drift migration
npx prisma migrate dev --name fix_schema_drift
```

**Test Failures**
```bash
# Reset database
npx prisma db push --force-reset
npm run db:seed
npm run test:ci
```

### Support Resources

- 📖 [POSTGRES_MIGRATION_EXECUTION.md](./POSTGRES_MIGRATION_EXECUTION.md)
- 📖 [PHASE17_MIGRATION_VERIFICATION.md](./PHASE17_MIGRATION_VERIFICATION.md)
- 📝 [Prisma Migration Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- 🐘 [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

## Success Criteria

✅ **Migration successful when:**

- [ ] ✅ PostgreSQL database created and accessible
- [ ] ✅ Schema migrated (13 tables present)
- [ ] ✅ All tests pass (471+)
- [ ] ✅ Data integrity verified (row counts match)
- [ ] ✅ Foreign key constraints working
- [ ] ✅ Performance baseline captured
- [ ] ✅ No new error messages in logs
- [ ] ✅ API endpoints responding
- [ ] ✅ Monitoring dashboards healthy
- [ ] ✅ Team informed of completion

---

## Sign-Off

- [ ] **Developer:** Migration verified and tested
  - Date: ___________
  - Name: ___________

- [ ] **QA/Tester:** All tests passed
  - Date: ___________
  - Name: ___________

- [ ] **DevOps/Database:** Production ready
  - Date: ___________
  - Name: ___________

---

## Notes & Issues

```
[Add any issues encountered, workarounds, or notes here]

Issue 1: ___________
Resolution: ___________

Issue 2: ___________
Resolution: ___________
```

---

**Last Updated:** 2026-04-14  
**Version:** 1.0  
**Author:** Migration Team
