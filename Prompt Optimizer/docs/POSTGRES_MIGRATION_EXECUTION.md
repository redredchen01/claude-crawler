# PostgreSQL Migration Execution Guide

**Generated:** 2026-04-14  
**Migration ID:** 1776154364506_init_postgresql  
**Status:** Ready for Deployment

---

## Quick Start (5 minutes)

```bash
# 1. Start PostgreSQL containers
docker-compose -f docker-compose.dev.yml up -d

# 2. Wait for PostgreSQL to be ready
docker-compose -f docker-compose.dev.yml ps

# 3. Run migration with Prisma
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer" \
  npx prisma migrate deploy

# 4. Verify schema created
docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer -c "\dt"

# 5. Run tests to verify everything works
npm run test:ci
```

---

## Detailed Steps

### Step 1: Prepare PostgreSQL Environment

```bash
# Navigate to project directory
cd "Prompt Optimizer"

# Verify Docker Compose file exists
ls -la docker-compose.dev.yml

# Start PostgreSQL service
docker-compose -f docker-compose.dev.yml up -d
```

**Expected output:**
```
Creating prompt-optimizer-postgres ... done
Creating prompt-optimizer-pgadmin ... done
Creating prompt-optimizer-redis ... done
Creating prompt-optimizer-jaeger ... done
```

### Step 2: Wait for PostgreSQL to be Ready

```bash
# Check service status
docker-compose -f docker-compose.dev.yml ps

# Wait for PostgreSQL health check to pass
# STATUS should show "healthy" after 10-30 seconds
```

**Health check:**
```bash
docker exec prompt-optimizer-postgres pg_isready -U postgres
# Output: accepting connections
```

### Step 3: Execute Migration

```bash
# Set temporary environment variable for migration
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"

# Run Prisma migration deployment
npx prisma migrate deploy

# Or use the .env.postgresql file:
# source .env.postgresql && npx prisma migrate deploy
```

**Expected output:**
```
✔ Your database is now in sync with your schema.

The following migration(s) have been applied:

migrations/
  └─ 1776154364506_init_postgresql/
    └─ migration.sql
```

### Step 4: Verify Schema Created

```bash
# Connect to PostgreSQL and verify tables
docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer -c "\dt"

# Expected: List of all tables (User, Team, TeamMember, etc.)
```

**Expected tables:**
```
             List of relations
 Schema |      Name      | Type  |  Owner
--------+----------------+-------+----------
 public | "ApiKey"       | table | postgres
 public | "AuditLog"     | table | postgres
 public | "BatchOptimizationJob" | table | postgres
 public | "OptimizationJob" | table | postgres
 public | "OptimizationRecord" | table | postgres
 public | "Session"      | table | postgres
 public | "StripeBilling" | table | postgres
 public | "Team"         | table | postgres
 public | "TeamMember"   | table | postgres
 public | "TeamQuota"    | table | postgres
 public | "User"         | table | postgres
 public | "WebhookConfig" | table | postgres
 public | "WebhookEvent" | table | postgres
 ...
```

### Step 5: Update Environment for PostgreSQL

```bash
# Option A: Create .env.local with PostgreSQL URL
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"
ANTHROPIC_API_KEY="your-api-key"
NEXTAUTH_SECRET="your-secret"
EOF

# Option B: Or update .env directly
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prompt_optimizer"
```

### Step 6: Run Tests Against PostgreSQL

```bash
# Verify tests pass with PostgreSQL backend
npm run test:ci

# Expected: 471+ tests passing
# Example output:
# Test Suites: 31+ passed
# Tests:       471+ passed
```

### Step 7: Seed Test Data (Optional)

```bash
# Populate PostgreSQL with seed data
npm run db:seed

# Verify data inserted
docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer \
  -c "SELECT COUNT(*) as user_count FROM \"User\";"
```

---

## Data Migration: SQLite → PostgreSQL (Zero-Downtime)

If you have existing data in SQLite that needs to be migrated:

### Export SQLite Data

```bash
# Export User table to CSV
sqlite3 prisma/dev.db << 'EOF'
.mode csv
.output /tmp/user_export.csv
SELECT * FROM User;
.quit
EOF

# Or export all tables
for table in User Team TeamMember OptimizationRecord ApiKey WebhookConfig AuditLog; do
  sqlite3 prisma/dev.db "SELECT * FROM $table" > /tmp/${table}_export.csv
done
```

### Import to PostgreSQL

```bash
# For each exported CSV file:
docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer << 'EOF'
COPY "User" FROM '/tmp/user_export.csv' WITH (FORMAT csv);
COPY "Team" FROM '/tmp/team_export.csv' WITH (FORMAT csv);
-- ... repeat for other tables
EOF
```

### Verify Data Integrity

```bash
# Compare row counts
echo "=== SQLite Counts ==="
sqlite3 prisma/dev.db "SELECT name, COUNT(*) as count FROM (
  SELECT 'User' as name FROM User
  UNION ALL SELECT 'Team' UNION ALL SELECT 'Team'
) GROUP BY name;"

echo "=== PostgreSQL Counts ==="
docker exec prompt-optimizer-postgres psql -U postgres -d prompt_optimizer << 'EOF'
SELECT table_name, (xpath('/row/@count', query_to_xml(format('SELECT COUNT(*) FROM "%s"', table_name), false, true, '')))[1]::text::int as count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
EOF
```

---

## Troubleshooting

### PostgreSQL Connection Refused

```bash
# Verify containers are running
docker-compose -f docker-compose.dev.yml ps

# Check logs
docker-compose -f docker-compose.dev.yml logs postgres

# Ensure correct password and database name
# DEFAULT: postgres / postgres @ localhost:5432 / prompt_optimizer
```

### Migration Already Applied

```bash
# View migration status
npx prisma migrate status

# If migration shows as applied but you want to reset:
npx prisma migrate reset  # WARNING: This deletes all data!

# Or mark as resolved if there's a conflict
npx prisma migrate resolve --rolled-back 1776154364506_init_postgresql
```

### Schema Conflicts

```bash
# If Prisma detects drift between schema.prisma and actual DB:
npx prisma db push --force-reset  # WARNING: Destructive!

# Or create a new migration to fix drift:
npx prisma migrate dev --name fix_schema_drift
```

### PgAdmin Access (Optional)

```bash
# Access database via web UI
# URL: http://localhost:5050
# Email: admin@example.com
# Password: admin

# Register server in PgAdmin:
# Host: prompt-optimizer-postgres
# Port: 5432
# Username: postgres
# Password: postgres
# Database: prompt_optimizer
```

---

## Performance Verification

### Run Load Test

```bash
# Measure PostgreSQL performance
npm run test:load

# Expected results:
# - Admin stats: <50ms (was 100-150ms with SQLite)
# - Batch processing: 1000 items in <30s
# - Concurrent requests: 100 req/s (was 20 req/s)
```

### Compare SQLite vs PostgreSQL

```bash
# 1. Benchmark SQLite
npx prisma migrate reset --force  # Switch back to SQLite
npm run test:load > /tmp/sqlite_results.txt

# 2. Switch to PostgreSQL
npx prisma db execute --stdin < prisma/migrations/1776154364506_init_postgresql/migration.sql
npm run test:load > /tmp/postgres_results.txt

# 3. Compare results
diff /tmp/sqlite_results.txt /tmp/postgres_results.txt
```

---

## Rollback (If Needed)

```bash
# To revert to SQLite:

# 1. Switch schema back
# Edit prisma/schema.prisma:
# provider = "sqlite"
# url      = env("DATABASE_URL")

# 2. Reset to SQLite
export DATABASE_URL="file:./prisma/dev.db"
npx prisma db push --force-reset

# 3. Verify
npm run test:ci
```

---

## Production Deployment

For production deployments:

### 1. Pre-deployment Checklist

```bash
# ✅ Backup SQLite data
cp prisma/dev.db prisma/dev.db.backup

# ✅ Export all data
sqlite3 prisma/dev.db ".tables" > /tmp/backup_tables.txt

# ✅ Verify PostgreSQL connectivity
psql -h <prod-postgres-host> -U <user> -d <database> -c "SELECT 1"

# ✅ Run tests against PostgreSQL
DATABASE_URL="postgresql://..." npm run test:ci
```

### 2. Execute Migration

```bash
# 1. Take application offline (blue-green deployment)
# 2. Export production SQLite data
# 3. Create PostgreSQL database
# 4. Run migration
# 5. Import data
# 6. Verify data integrity
# 7. Bring application online
# 8. Monitor for 24 hours
```

### 3. Monitor Health

```bash
# Watch for errors
tail -f /var/log/app.json | jq 'select(.level == "ERROR")'

# Monitor database connections
psql -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Check query performance
psql -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

---

## Success Criteria

✅ **Migration successful when:**

1. ✅ All tables created in PostgreSQL
2. ✅ Schema matches Prisma schema.prisma
3. ✅ Data integrity verified (row counts match)
4. ✅ Foreign key constraints working
5. ✅ All tests pass (471+)
6. ✅ No new application errors
7. ✅ Performance improved vs SQLite
8. ✅ Monitoring dashboards healthy

---

## Next Steps

- [ ] Execute migration steps 1-7 above
- [ ] Run performance benchmarks
- [ ] Document migration in DEPLOYMENT_CHECKLIST.md
- [ ] Update README with PostgreSQL setup instructions
- [ ] Schedule production migration with team

---

**Support:**
- Check logs: `docker-compose logs postgres`
- Verify schema: `psql -d prompt_optimizer -c "\d User"`
- Test connection: `npm run test:ci`
