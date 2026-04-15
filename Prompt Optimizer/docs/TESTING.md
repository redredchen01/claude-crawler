# Prompt Optimizer MVP - Testing Guide

## Quick Verification

Run the MVP verification script:
```bash
./scripts/verify-mvp.sh
```

Expected output: **✅ MVP structure verified!**

---

## Unit Test Structure (Ready to Extend)

### Test Framework

- **Framework:** Jest
- **React Testing:** @testing-library/react
- **Configuration:** jest.config.js, jest.setup.js

### Run Tests

```bash
# Watch mode (during development)
npm run test

# Single run (CI/CD)
npm run test:ci
```

### Test Targets

| Component | Status | Path |
|-----------|--------|------|
| LLM Client | TODO | `__tests__/services/llm.test.ts` |
| Scoring Service | TODO | `__tests__/services/scoring.test.ts` |
| Optimization | TODO | `__tests__/services/optimization.test.ts` |
| API /score | TODO | `__tests__/api/score.test.ts` |
| API /optimize-full | TODO | `__tests__/api/optimize-full.test.ts` |
| Frontend | TODO | `__tests__/components/page.test.tsx` |

### Example Test Template

```typescript
// __tests__/services/scoring.test.ts
import { scorePromptService } from '@/lib/services/scoring'
import * as llm from '@/lib/llm/client'

jest.mock('@/lib/llm/client')

describe('Scoring Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should score a valid prompt', async () => {
    const mockScore = {
      total: 45,
      dimensions: { specificity: 10, context: 8, output_spec: 12, runnability: 8, evaluation: 5, safety: 2 },
      missing_slots: ['language', 'format'],
      issues: 'Missing implementation details',
      diagnostics: 'Specify what programming language and output format',
    }
    ;(llm.scorePrompt as jest.Mock).mockResolvedValue(mockScore)

    const result = await scorePromptService('Write code')
    expect(result.total).toBe(45)
    expect(result.missing_slots).toContain('language')
  })

  test('should throw on empty prompt', async () => {
    await expect(scorePromptService('')).rejects.toThrow('cannot be empty')
  })

  test('should throw on very long prompt', async () => {
    const longPrompt = 'a'.repeat(50001)
    await expect(scorePromptService(longPrompt)).rejects.toThrow('exceeds maximum')
  })
})
```

---

## Integration Testing (End-to-End)

### Prerequisites

```bash
# 1. Start Postgres
docker compose up -d

# 2. Setup database
npm run db:push
npm run db:seed

# 3. Set environment
export ANTHROPIC_API_KEY=sk-ant-...
```

### E2E Test Flow

```bash
# Start dev server
npm run dev &

# Wait for server startup
sleep 3

# Test endpoints
./scripts/test-e2e.sh
```

### Manual E2E Flow

1. **Score endpoint:**
   ```bash
   curl -X POST http://localhost:3000/api/score \
     -H "Content-Type: application/json" \
     -d '{"raw_prompt":"Write code"}'
   ```
   Expect: `{ "total": number, "dimensions": {...} }`

2. **Optimize endpoint:**
   ```bash
   curl -X POST http://localhost:3000/api/optimize-full \
     -H "Content-Type: application/json" \
     -d '{"raw_prompt":"Write code"}'
   ```
   Expect: `{ "optimized_prompt": string, "raw_score": {...}, "optimized_score": {...} }`

3. **Demo endpoint:**
   ```bash
   curl http://localhost:3000/api/demo
   ```
   Expect: Hardcoded demo record (instant, no API call)

---

## Browser Testing (Manual)

### Setup

```bash
npm run dev
# Open http://localhost:3000
```

### Test Cases

**TC-1: Score Basic Prompt**
- Input: "Write code"
- Action: Click "📊 Score"
- Expected:
  - [ ] Score displays (35-50 range)
  - [ ] Dimensions shown with subscores
  - [ ] Missing slots: ["task", "language", ...]
  - [ ] Diagnostics visible

**TC-2: Full Optimization**
- Input: Same prompt
- Action: Click "✨ Optimize"
- Expected:
  - [ ] Loading spinner during request
  - [ ] Optimized prompt shows (longer, more specific)
  - [ ] Score improved (delta > 0)
  - [ ] Explanation visible
  - [ ] Copy button works

**TC-3: Demo Mode**
- Action: Click "📋 Load Demo"
- Expected:
  - [ ] Loads instantly (<100ms)
  - [ ] No network requests to /api/
  - [ ] Shows example with ~50 point improvement

**TC-4: Error Handling**
- Remove `ANTHROPIC_API_KEY` from .env
- Restart server
- Action: Click "Score"
- Expected:
  - [ ] Error message displayed
  - [ ] Graceful failure (no crash)

**TC-5: Responsive Design**
- Resize browser to mobile (320px width)
- Expected:
  - [ ] Layout stacks vertically
  - [ ] Buttons remain clickable
  - [ ] Text readable

---

## Performance Baselines

| Operation | Baseline | Acceptable |
|-----------|----------|-----------|
| Score (Claude API) | 3-5s | <10s |
| Optimize (2 x Claude) | 6-10s | <15s |
| Demo load | <10ms | <50ms |
| UI re-render | <100ms | <500ms |

---

## Debugging

### Enable Verbose Logging

```bash
# In .env
DEBUG=prompt-optimizer:*

# In code
console.log('[SCORING]', { rawPrompt, score })
```

### Check Database State

```bash
# Open Prisma Studio
npm run db:studio

# Or CLI
docker compose exec postgres psql -U user -d prompt_optimizer \
  -c "SELECT id, raw_prompt, raw_score->>'total' as raw_total FROM \"OptimizationRecord\" LIMIT 5;"
```

### Common Issues

| Issue | Debug | Fix |
|-------|-------|-----|
| "ANTHROPIC_API_KEY not set" | `echo $ANTHROPIC_API_KEY` | Add to .env and restart |
| "Postgres connection failed" | `docker compose ps` | `docker compose up -d` |
| "Type errors after edit" | `npm run build` | Clear `.next` folder |
| "Port 3000 in use" | `lsof -i :3000` | Kill or use `-p 3001` |

---

## Test Results Tracking

After running tests, document results in a summary:

```
# Test Run: 2026-04-13

## Unit Tests
- Scoring Service: ✓ 5/5 passed
- LLM Client: ✓ 4/4 passed
- API Routes: ✓ 6/6 passed

## E2E Tests
- Demo load: ✓ PASS
- Score endpoint: ✓ PASS
- Optimize endpoint: ✓ PASS (requires API key)

## Manual Browser Tests
- TC-1 Score Basic: ✓ PASS
- TC-2 Full Optimization: ✓ PASS
- TC-3 Demo Mode: ✓ PASS
- TC-4 Error Handling: ✓ PASS
- TC-5 Responsive: ✓ PASS

## Performance
- Score latency: 4.2s ✓
- Optimize latency: 8.5s ✓
- Demo latency: <5ms ✓

## Status: READY FOR PRODUCTION ✅
```

---

## Next Steps

1. **Add unit tests** from template above
2. **Run full test suite** before creating PR
3. **Document test results** in PR description
4. **Setup CI/CD** to auto-run tests on push

See `README.md` for production deployment checklist.
