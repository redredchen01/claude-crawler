# Local Testing Guide for Prompt Optimizer MVP

## Prerequisites

- Node.js 18+
- Docker (for Postgres)
- ANTHROPIC_API_KEY from https://console.anthropic.com

## Full Setup (15 minutes)

### 1. Start Database

```bash
# Start Postgres in Docker
docker compose up -d

# Verify connection
docker compose exec postgres psql -U user -d prompt_optimizer -c "SELECT 1"
```

### 2. Setup Environment

```bash
# Copy template and add your API key
cp .env.example .env

# Edit .env - add your ANTHROPIC_API_KEY
nano .env
```

### 3. Initialize Database

```bash
# Create schema
npm run db:push

# Seed demo data
npm run db:seed

# Verify
npm run db:studio  # Opens visual DB editor
```

### 4. Start Dev Server

```bash
npm run dev
# Opens http://localhost:3000
```

## Manual Testing Flows

### Flow 1: Score a Prompt (Happy Path)

1. Open http://localhost:3000
2. Enter prompt: `"Write code that validates email"`
3. Click "📊 Score" button
4. Expect:
   - ✓ Score displays (0-100)
   - ✓ Six dimensions show with scores
   - ✓ Missing slots listed (e.g., "language", "format")
   - ✓ Diagnostics explain gaps

### Flow 2: Full Optimization (Happy Path)

1. Keep previous prompt in input
2. Click "✨ Optimize" button
3. Expect:
   - ✓ Loading spinner appears
   - ✓ Optimized prompt displays
   - ✓ Score improvement shown (e.g., "+35 points")
   - ✓ Before/after comparison visible
   - ✓ Copy button works

### Flow 3: Load Demo (No API Call)

1. Click "📋 Load Demo" button
2. Expect:
   - ✓ Raw prompt populated
   - ✓ Both scores visible immediately
   - ✓ No network requests to /api/optimize-full
   - ✓ Demo shows ~50 point improvement

### Flow 4: Error Handling

1. **Missing API Key:**
   - Delete `ANTHROPIC_API_KEY` from `.env`
   - Restart server
   - Click "Score" → Expect 500 error

2. **Network Error:**
   - Close Docker Postgres: `docker compose down`
   - Try to submit form → Expect DB error

3. **Invalid Input:**
   - Leave prompt empty
   - Click "Score" → Expect validation message

## API Testing (cURL)

### Test /api/score

```bash
curl -X POST http://localhost:3000/api/score \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt":"Write a function"}'

# Expected response:
# {
#   "total": 45,
#   "dimensions": { "specificity": 10, ... },
#   "missing_slots": ["language", "constraints", ...],
#   "issues": "...",
#   "diagnostics": "..."
# }
```

### Test /api/optimize-full

```bash
curl -X POST http://localhost:3000/api/optimize-full \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt":"Write a function"}'

# Expected response:
# {
#   "optimized_prompt": "Write a Python function that...",
#   "explanation": "Added language, specifics...",
#   "raw_score": { ... },
#   "optimized_score": { ... },
#   "score_delta": { "total_delta": 35, ... }
# }
```

### Test /api/demo (No API Key Needed)

```bash
curl http://localhost:3000/api/demo

# Returns hardcoded demo result
```

## Database Verification

### Check Saved Records

```bash
npm run db:studio  # Open Prisma Studio

# Or via CLI:
docker compose exec postgres psql -U user -d prompt_optimizer \
  -c "SELECT id, raw_prompt, json_extract(raw_score, '$.total') as raw_total, json_extract(optimized_score, '$.total') as opt_total FROM \"OptimizationRecord\" LIMIT 5;"
```

### Expected State

- Raw prompt text should be exact match
- raw_score.total should be 0-100
- optimized_score.total should be 0-100
- optimized_score > raw_score (improvement)
- Timestamps should be recent

## Performance Notes

- **First score:** ~3-5 seconds (Claude API latency)
- **Demo endpoint:** <10ms (no API call)
- **UI responsiveness:** Smooth with loading spinner visible

## Common Issues

### "ANTHROPIC_API_KEY not found"
```bash
# Check .env file
cat .env | grep ANTHROPIC_API_KEY

# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

### "Can't connect to Postgres"
```bash
# Check Docker status
docker compose ps

# Restart if needed
docker compose down && docker compose up -d
```

### "Port 3000 already in use"
```bash
# Kill process or use different port
npm run dev -- -p 3001
```

### "Build errors after changing code"
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

## Success Criteria

After completing this guide, you should:
- [x] See /dashboard load in browser
- [x] Score a real prompt (not demo)
- [x] See improvement after optimization
- [x] Database shows saved records
- [x] cURL tests return valid JSON

## Next: CI/CD Testing

After local testing works, run:
```bash
npm run test:ci        # Run all tests once
npm run lint           # Check code style
```

Then proceed to `/ship` to create PR.
