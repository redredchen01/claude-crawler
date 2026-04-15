# API Reference

## Scoring Endpoint

### POST `/api/score`

Score a prompt without optimization.

**Request:**
```json
{
  "raw_prompt": "Your prompt text here"
}
```

**Response (200 OK):**
```json
{
  "total": 45,
  "dimensions": {
    "specificity": 8,
    "context": 7,
    "output_spec": 12,
    "runnability": 8,
    "evaluation": 6,
    "safety": 4
  },
  "missing_slots": ["goal", "constraints", "success_metric"],
  "issues": "Lacks clear objectives and constraints",
  "diagnostics": "The prompt needs more specificity about what the output should achieve..."
}
```

**Error (400):**
```json
{
  "error": "Missing or invalid raw_prompt field"
}
```

**Error (500):**
```json
{
  "error": "Failed to score prompt"
}
```

## Full Optimization Endpoint

### POST `/api/optimize-full`

Complete optimization pipeline: score → optimize → re-score → save to DB.

**Request:**
```json
{
  "raw_prompt": "Your prompt text here"
}
```

**Response (200 OK):**
```json
{
  "optimized_prompt": "Improved prompt text...",
  "explanation": "Added specificity by defining...",
  "optimized_score": {
    "total": 82,
    "dimensions": {...},
    "missing_slots": [],
    "issues": "None",
    "diagnostics": "..."
  },
  "score_delta": {
    "total_delta": 37,
    "dimension_deltas": {
      "specificity": 12,
      "context": 10,
      "output_spec": 8,
      "runnability": 6,
      "evaluation": 2,
      "safety": -1
    }
  }
}
```

**Error (500):**
```json
{
  "error": "Failed to optimize prompt"
}
```

## Demo Endpoint

### GET `/api/demo`

Fetch pre-computed demo data (no LLM calls, useful for testing UI).

**Response (200 OK):**
```json
{
  "id": "demo-1",
  "raw_prompt": "Write code",
  "raw_score": {...},
  "optimized_prompt": "...",
  "optimized_score": {...},
  "optimization_explanation": "..."
}
```

## Rate Limiting

The Anthropic API has rate limits. The client automatically retries up to 3 times with exponential backoff (2s, 4s, 8s). If all retries fail, a 500 error is returned.

## Validation Rules

| Field | Rules |
|-------|-------|
| `raw_prompt` | Non-empty string, max 50,000 chars |
| `optimized_prompt` | Auto-generated, max 50,000 chars |
| Scores | Numbers in specified ranges (0-100 total) |

## Database Schema

See `prisma/schema.prisma` for the OptimizationRecord model structure.
