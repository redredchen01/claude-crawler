# Prompt Optimizer — API Reference Guide

**Version:** 0.2.0  
**Base URL:** `https://your-domain.com/api`  
**Authentication:** JWT Bearer Token (via NextAuth.js)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Scoring & Optimization](#scoring--optimization)
3. [Batch Processing](#batch-processing)
4. [Search & History](#search--history)
5. [Admin Routes](#admin-routes)
6. [Rate Limiting](#rate-limiting)
7. [Error Handling](#error-handling)

---

## Authentication

### Register

```
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "confirmPassword": "securepassword"
}

Response (200):
{
  "id": "user-123",
  "email": "user@example.com",
  "role": "USER",
  "message": "User created successfully"
}
```

### Login

```
POST /auth/[...nextauth]
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response (200):
{
  "url": "http://localhost:3000/dashboard",
  "ok": true
}
```

### Health Check

```
GET /health

Response (200):
{
  "status": "healthy",
  "timestamp": "2026-04-13T10:00:00Z",
  "version": "0.2.0"
}
```

---

## Scoring & Optimization

### Score Single Prompt

```
POST /score
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "raw_prompt": "Write code to process CSV files"
}

Response (200):
{
  "total": 45,
  "dimensions": {
    "specificity": 10,
    "context": 8,
    "output_spec": 12,
    "runnability": 8,
    "evaluation": 5,
    "safety": 2
  },
  "missing_slots": ["language", "constraints"],
  "issues": "Missing language specification",
  "diagnostics": "Prompt is too vague"
}

Headers:
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1681412400
```

### Optimize & Score Prompt

```
POST /optimize-full
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "raw_prompt": "Write code to process CSV files"
}

Response (200):
{
  "optimized_prompt": "Write Python code to process CSV files with error handling",
  "explanation": "Added language (Python) and error handling requirement",
  "raw_score": {
    "total": 45,
    "dimensions": { ... }
  },
  "optimized_score": {
    "total": 70,
    "dimensions": { ... }
  },
  "score_delta": {
    "total_delta": 25,
    "dimension_deltas": {
      "specificity": 5,
      "context": 4,
      "output_spec": 6,
      "runnability": 4,
      "evaluation": 3,
      "safety": 3
    }
  }
}

Headers:
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1681412400
```

---

## Batch Processing

### Optimize Multiple Prompts

```
POST /optimize-full/batch
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "prompts": [
    "Prompt 1",
    "Prompt 2",
    "Prompt 3"
  ]
}

Response (200):
{
  "batch_size": 3,
  "results": [
    {
      "success": true,
      "raw_prompt": "Prompt 1",
      "optimized_prompt": "...",
      "explanation": "...",
      "raw_score": { ... },
      "optimized_score": { ... },
      "score_delta": { ... }
    },
    {
      "success": false,
      "raw_prompt": "Prompt 2",
      "error": "Service error"
    },
    {
      "success": true,
      "raw_prompt": "Prompt 3",
      "optimized_prompt": "...",
      ...
    }
  ],
  "summary": {
    "total": 3,
    "successful": 2,
    "failed": 1
  }
}

Headers:
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7  (3 prompts consumed)
X-RateLimit-Reset: 1681412400
```

**Constraints:**
- Max 10 prompts per request
- Each prompt counts individually against rate limit
- Returns 429 if insufficient quota

---

## Search & History

### Search Prompts

```
GET /user/search?q=optimization&limit=20&offset=0
Authorization: Bearer <jwt_token>

Response (200):
{
  "query": "optimization",
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 45,
    "returned": 20
  },
  "records": [
    {
      "id": "record-123",
      "raw_prompt": "How to optimize Python code",
      "raw_score": 45,
      "optimized_prompt": "How to optimize Python code for performance",
      "optimized_score": 70,
      "explanation": "Added specificity about performance",
      "created_at": "2026-04-13T10:00:00Z"
    },
    ...
  ]
}
```

**Query Parameters:**
- `q` (required): Search term (max 500 chars)
- `limit` (optional): Results per page (1-100, default 50)
- `offset` (optional): Pagination offset (default 0)

**Searches Across:**
- raw_prompt
- optimized_prompt
- optimization_explanation

### Get User History

```
GET /user/history?limit=50
Authorization: Bearer <jwt_token>

Response (200):
{
  "records": [
    {
      "id": "record-123",
      "created_at": "2026-04-13T10:00:00Z",
      "raw_score": 45,
      "optimized_score": 70,
      "delta": 25
    },
    ...
  ],
  "stats": {
    "totalCount": 100,
    "avgRawScore": 42.5,
    "avgOptimizedScore": 62.3,
    "avgDelta": 19.8
  }
}
```

---

## Admin Routes

### List All Users

```
GET /admin/users
Authorization: Bearer <admin_jwt_token>

Response (200):
{
  "users": [
    {
      "id": "user-123",
      "email": "user@example.com",
      "role": "USER",
      "createdAt": "2026-04-01T00:00:00Z"
    },
    ...
  ]
}
```

**Requires:** ADMIN role

### Get System Statistics

```
GET /admin/stats
Authorization: Bearer <admin_jwt_token>

Response (200):
{
  "stats": {
    "totalUsers": 50,
    "totalOptimizations": 500,
    "recordsByUser": [
      { "email": "user1@example.com", "count": 25 },
      { "email": "user2@example.com", "count": 20 },
      ...
    ]
  }
}
```

### Get Detailed Analytics

```
GET /admin/analytics?days=30
Authorization: Bearer <admin_jwt_token>

Response (200):
{
  "overview": {
    "totalUsers": 50,
    "totalOptimizations": 500,
    "avgRawScore": 42.5,
    "avgOptimizedScore": 62.3,
    "avgDelta": 19.8
  },
  "timeSeries": [
    { "date": "2026-04-13", "count": 20 },
    { "date": "2026-04-12", "count": 18 },
    ...
  ],
  "scoreDistribution": [
    { "bucket": "0-20", "count": 10 },
    { "bucket": "21-40", "count": 50 },
    { "bucket": "41-60", "count": 150 },
    { "bucket": "61-80", "count": 200 },
    { "bucket": "81-100", "count": 90 }
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
    { "email": "power-user@example.com", "count": 50 },
    ...
  ]
}
```

### Delete User

```
DELETE /admin/users
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "userId": "user-123"
}

Response (200):
{
  "message": "User deleted successfully",
  "user": {
    "id": "user-123",
    "email": "user@example.com"
  }
}
```

**Requires:** ADMIN role  
**Note:** Cannot delete your own account

---

## Rate Limiting

### Rate Limit Headers

All endpoints return rate limit information:

```
X-RateLimit-Limit: 10              # Total quota
X-RateLimit-Remaining: 7           # Remaining after this request
X-RateLimit-Reset: 1681412400      # Unix timestamp when limit resets
Retry-After: 3599                  # Seconds to wait (on 429 only)
```

### Rate Limit Behavior

**optimize-full endpoint:**
- Limit: 10 requests/hour per user
- Configurable: `RATE_LIMIT_OPTIMIZE_PER_HOUR`
- Persistent across restarts (DB-backed)

**score endpoint:**
- Limit: 30 requests/hour per user
- Configurable: `RATE_LIMIT_SCORE_PER_HOUR`
- In-memory tracking (resets on restart)

**batch endpoint:**
- Each prompt counts individually
- Returns 429 if insufficient quota for entire batch

---

## Error Handling

### Error Response Format

```
{
  "error": "Description of what went wrong"
}
```

### Common HTTP Status Codes

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Prompt scored/optimized |
| 400 | Bad Request | Missing/invalid parameters |
| 401 | Unauthorized | Missing/invalid JWT token |
| 403 | Forbidden | ADMIN route, user is not admin |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | User exceeded quota |
| 500 | Server Error | Internal server error |

### Example Errors

**Missing Authentication:**
```
Status: 401
{
  "error": "Authentication required"
}
```

**Rate Limit Exceeded:**
```
Status: 429
{
  "error": "Insufficient rate limit quota. Needed: 15, Remaining: 10"
}

Headers:
X-RateLimit-Remaining: 10
Retry-After: 3599
```

**Invalid Input:**
```
Status: 400
{
  "error": "Prompt exceeds maximum length of 50000 characters"
}
```

---

## Examples with cURL

### Score a Prompt

```bash
curl -X POST https://your-domain.com/api/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_prompt": "Write a Python script to process CSV files"
  }'
```

### Optimize a Prompt

```bash
curl -X POST https://your-domain.com/api/optimize-full \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_prompt": "Write code to process CSV files"
  }'
```

### Batch Optimization

```bash
curl -X POST https://your-domain.com/api/optimize-full/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "Prompt 1",
      "Prompt 2",
      "Prompt 3"
    ]
  }'
```

### Search History

```bash
curl "https://your-domain.com/api/user/search?q=python&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Get User History

```bash
curl "https://your-domain.com/api/user/history?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Changelog

**v0.2.0** (2026-04-13)
- Added batch optimization endpoint
- Added full-text search on history
- Added rate limiting
- Improved monitoring & logging

**v0.1.2** (2026-04-13)
- LLM pipeline optimizations
- Retry jitter and timeout control
- Health check endpoint

**v0.1.1** (2026-04-10)
- Core API endpoints stable
- Authentication & RBAC working
- Admin analytics implemented

---

**Last Updated:** 2026-04-13  
**Maintained By:** Engineering Team  
**Contact:** support@your-domain.com
