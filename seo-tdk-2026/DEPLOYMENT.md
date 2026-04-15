# TDK Optimizer — Deployment Guide

**Quick deployment guide for personal use and production environments.**

---

## Local Development Setup

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/))
- npm or yarn
- SQLite 3 (usually pre-installed)

### Installation

```bash
# 1. Clone and navigate to project
git clone <repo>
cd seo-tdk-2026

# 2. Install dependencies
npm install

# 3. Setup environment file
cp .env.example .env
```

### Configure Environment

Edit `.env` with your settings:

```env
# Required: Claude API Key (get from https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-your-key-here

# Optional: Customize for your use case
TDK_GENERATION_TIMEOUT_MS=5000
TDK_CACHE_TTL_MINUTES=60

# Optional: Adjust SEO rules
TITLE_LENGTH_OPTIMAL_MIN_EN=50
TITLE_LENGTH_OPTIMAL_MAX_EN=60
TITLE_LENGTH_OPTIMAL_MIN_ZH=15
TITLE_LENGTH_OPTIMAL_MAX_ZH=30

# Optional: Rate limiting
REQUESTS_PER_HOUR=100
```

### Run Locally

```bash
# Start development server
npm run dev

# Server runs on http://localhost:3000

# Backend API: http://localhost:3000/api
# Database: ./seo-tdk-2026.db (SQLite file)
```

---

## Testing

Verify installation with tests:

```bash
# Run all 297 tests
npm test

# Run specific test file
npm test -- tdk.test.ts

# Watch mode (re-run on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

**Expected output:**
```
Test Suites: 13 passed, 13 total
Tests:       297 passed, 297 total
```

---

## First Steps - Verify API Works

### 1. Start the server
```bash
npm run dev
```

### 2. Test health check
```bash
curl http://localhost:3000/api/health
```

### 3. Generate TDK (with your API key)
```bash
curl -X POST http://localhost:3000/api/projects/test-project/clusters/test-cluster/tdk-optimize \
  -H "x-user-id: user-1" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Python tutorial",
    "keywords": ["python", "tutorial", "beginners"],
    "contentSnippet": "Learn Python programming from scratch",
    "language": "en"
  }'
```

### 4. Check usage
```bash
curl http://localhost:3000/api/cost-summary \
  -H "x-user-id: user-1"
```

---

## Database Management

### View Database

SQLite database is stored at `./seo-tdk-2026.db`

#### Using SQLite CLI
```bash
# Open database
sqlite3 seo-tdk-2026.db

# List tables
.tables

# View schema
.schema contentPlans

# Query data
SELECT clusterId, title, tdkGenerationCount FROM contentPlans LIMIT 5;

# Exit
.quit
```

#### Using VS Code Extension
1. Install "SQLite" extension
2. Open Command Palette (Cmd+Shift+P)
3. Search "SQLite: Open Database"
4. Select `seo-tdk-2026.db`
5. Browse tables and run queries

### Reset Database

```bash
# Delete and recreate (loses all data)
rm seo-tdk-2026.db
npm run dev  # Automatically initializes schema

# Or manually initialize
npm run build  # Compiles TypeScript
node dist/backend/src/db/index.js  # Runs initialization
```

---

## Production Deployment

### Docker (Recommended)

```dockerfile
# Create Dockerfile in project root
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/backend/src/index.js"]
```

#### Build and run
```bash
# Build image
docker build -t tdk-optimizer:latest .

# Run container
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-... \
  -v tdk-db:/app/data \
  tdk-optimizer:latest
```

### Environment Variables for Production

```env
# Required
ANTHROPIC_API_KEY=sk-your-production-key

# Recommended
NODE_ENV=production
TDK_GENERATION_TIMEOUT_MS=5000
TDK_CACHE_TTL_MINUTES=60
REQUESTS_PER_HOUR=100

# Optional: Database path (default: ./seo-tdk-2026.db)
DATABASE_PATH=/app/data/seo-tdk-2026.db

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info
```

### Health Check Endpoint

```bash
# Verify service is running
curl -f http://localhost:3000/api/health || exit 1
```

---

## Performance Tuning

### Caching
```env
# Cache TDK results for 60 minutes
TDK_CACHE_TTL_MINUTES=60

# Adjust for your use case:
# - Personal use: 60 min (reduce API calls)
# - Production: 30-60 min (balance freshness vs cost)
```

### Rate Limiting
```env
# Current: 100 requests/hour per user (MVP)
REQUESTS_PER_HOUR=100

# For single-user personal use, can increase to 500+
# For team use, keep at 100 or implement per-user quotas
```

### Database Optimization
```bash
# Analyze query performance
sqlite3 seo-tdk-2026.db

# View indexes
.indices contentPlans

# Manually optimize (periodic)
VACUUM;
ANALYZE;
```

---

## Monitoring & Logs

### Check API logs
```bash
# Start with debug logging
DEBUG=* npm run dev

# Or set in .env
LOG_LEVEL=debug
```

### Monitor Database Size
```bash
# Check database file size
ls -lh seo-tdk-2026.db

# If database grows too large (>500MB):
sqlite3 seo-tdk-2026.db "VACUUM;"
```

### Track Cost/Usage
```bash
curl http://localhost:3000/api/cost-summary \
  -H "x-user-id: your-user-id"

# Returns:
# - totalTokens: Accumulated tokens used
# - requestCount: Total API calls
# - avgTokensPerRequest: Average per call
# - remainingRequests: Quota remaining this hour
```

---

## Troubleshooting

### "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Database locked error
```bash
# Another process has database open
# Solution 1: Restart server
# Solution 2: Close other connections to database
```

### API key not working
```bash
# Verify key format
echo $ANTHROPIC_API_KEY  # Should start with sk-

# Get new key from https://console.anthropic.com/account/keys
# Update .env and restart
npm run dev
```

### Rate limit exceeded
```bash
# Check remaining quota
curl http://localhost:3000/api/cost-summary -H "x-user-id: user-1"

# Reset: Change user-id in requests (each user gets 100/hour)
# Or wait for hour window to reset
```

---

## Backup & Recovery

### Backup Database
```bash
# Simple copy (when server is stopped)
cp seo-tdk-2026.db seo-tdk-2026.backup.db

# Or use SQLite backup
sqlite3 seo-tdk-2026.db ".backup 'seo-tdk-2026.backup.db'"
```

### Restore from Backup
```bash
# Stop server first
npm stop

# Restore backup
cp seo-tdk-2026.backup.db seo-tdk-2026.db

# Restart
npm run dev
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor error logs
- Check API response times

**Weekly:**
- Review usage statistics
- Archive old feedback data (if needed)

**Monthly:**
- Backup database
- Review cost trends
- Update ANTHROPIC_API_KEY rotation (if required)

---

## Support & Debugging

### Enable Debug Mode
```bash
# See detailed logs
DEBUG=* npm run dev

# Or specific modules
DEBUG=tdk:* npm run dev
```

### Database Inspection
```bash
# Export data for analysis
sqlite3 seo-tdk-2026.db ".mode csv" \
  "SELECT * FROM contentPlans;" > export.csv

# Check conflict analysis results
sqlite3 seo-tdk-2026.db \
  "SELECT clusterId, title, tdkLanguage FROM contentPlans WHERE tdkGenerationCount > 0;"
```

### API Testing with Postman/Insomnia

1. Import collection from `/docs/postman-collection.json` (if available)
2. Set environment variables:
   - `base_url`: http://localhost:3000
   - `api_key`: your-anthropic-key
   - `user_id`: test-user-123
3. Run requests

---

## Next Steps

1. **[Read TDK_OPTIMIZER_GUIDE.md](./docs/TDK_OPTIMIZER_GUIDE.md)** for usage instructions
2. **[Check API Reference](./README.md#api-reference)** for all endpoints
3. **Generate your first TDK** using curl or your client
4. **Monitor costs** via `/api/cost-summary`
5. **Explore multi-page analysis** with `/conflict-report`

---

**Last updated:** 2026-04-15 | **Version:** v0.3.0
