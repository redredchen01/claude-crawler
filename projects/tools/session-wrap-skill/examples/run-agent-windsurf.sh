#!/bin/bash
set -e

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-demo}"
mkdir -p "$YD_MEMORY"
source ~/.zshrc-wrap

echo "📖 AGENT: Windsurf (API Documentation)"
echo "📅 Day: 2"
echo "🎯 Task: Document API"
echo ""

# ============================================
# 1. Load Context
# ============================================
echo "1️⃣ Loading project context..."

agent-context
echo ""

# ============================================
# 2. Check Task Status
# ============================================
echo "2️⃣ Checking task status..."

agent-tasks next
echo ""

# ============================================
# 3. Read Previous Agents' Work
# ============================================
echo "3️⃣ Reading Codex's progress..."

agent-share read codex
echo ""

echo "Reading Cursor's progress..."
agent-share read cursor
echo ""

# ============================================
# 4. Claim Documentation Task
# ============================================
echo "4️⃣ Claiming API documentation task..."

agent-tasks claim "api-docs" "windsurf"

# ============================================
# 5. Write API Documentation
# ============================================
echo "5️⃣ Writing comprehensive API documentation..."

agent-decision log "documentation-format" "OpenAPI 3.0 + markdown with curl examples" << 'DECISION'
Standard format that tools can consume. Curl examples help developers test immediately.
Matches what Codex chose: REST with UUID IDs and JWT auth.
DECISION

# Simulate documentation work
sleep 2
echo "   ✓ API specification written"
echo "   ✓ Authentication guide created"
echo "   ✓ Curl examples for all endpoints"
echo "   ✓ Error response documentation"

agent-share write windsurf << 'DOCS'
# Todo API Documentation

## Overview
REST API for Todo application. Requires JWT authentication.

### Base URL
```
https://api.todo-app.com/v1
```

### Authentication
All endpoints (except /auth/*) require Bearer token:
```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### POST /auth/register
Register new user account.

**Request:**
```bash
curl -X POST https://api.todo-app.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepass123"
  }'
```

**Response (201):**
```json
{
  "status": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com"
    }
  }
}
```

**Errors:**
- 400: Invalid email/password format
- 409: Email already registered

---

### POST /auth/login
Login with email and password.

**Request:**
```bash
curl -X POST https://api.todo-app.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepass123"
  }'
```

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com"
    }
  }
}
```

**Errors:**
- 401: Invalid credentials
- 404: User not found

---

### POST /auth/refresh
Refresh access token using refresh token.

**Request:**
```bash
curl -X POST https://api.todo-app.com/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- 401: Invalid or expired refresh token

---

## Todo Endpoints

### GET /todos
Get all todos for current user.

**Request:**
```bash
curl -X GET https://api.todo-app.com/v1/todos \
  -H "Authorization: Bearer <access_token>"
```

**Response (200):**
```json
{
  "status": "ok",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Learn TypeScript",
      "description": "Master advanced types",
      "done": false,
      "created_at": "2026-03-26T12:00:00Z",
      "updated_at": "2026-03-26T12:00:00Z"
    }
  ]
}
```

---

### POST /todos
Create new todo.

**Request:**
```bash
curl -X POST https://api.todo-app.com/v1/todos \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Learn GraphQL",
    "description": "Understand query language"
  }'
```

**Response (201):**
```json
{
  "status": "ok",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "title": "Learn GraphQL",
    "description": "Understand query language",
    "done": false,
    "created_at": "2026-03-26T12:05:00Z",
    "updated_at": "2026-03-26T12:05:00Z"
  }
}
```

---

### PUT /todos/:id
Update a todo.

**Request:**
```bash
curl -X PUT https://api.todo-app.com/v1/todos/550e8400-e29b-41d4-a716-446655440002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Master GraphQL",
    "done": true
  }'
```

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "title": "Master GraphQL",
    "description": "Understand query language",
    "done": true,
    "created_at": "2026-03-26T12:05:00Z",
    "updated_at": "2026-03-26T12:10:00Z"
  }
}
```

---

### DELETE /todos/:id
Delete a todo.

**Request:**
```bash
curl -X DELETE https://api.todo-app.com/v1/todos/550e8400-e29b-41d4-a716-446655440002 \
  -H "Authorization: Bearer <access_token>"
```

**Response (204):**
```
No content
```

---

## Error Response Format

All errors follow this format:

```json
{
  "status": "error",
  "message": "Description of what went wrong",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- 200: Success
- 201: Created
- 204: No content
- 400: Bad request (validation error)
- 401: Unauthorized (missing/invalid auth)
- 404: Not found
- 409: Conflict (already exists)
- 500: Server error

---

## Token Details

### Access Token (15 minutes)
```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "iat": 1711440000,
  "exp": 1711440900
}
```

### Refresh Token (7 days)
- Stored in httpOnly cookie (inaccessible to JavaScript)
- Auto-included in requests
- User cannot directly access

---

## Best Practices

1. **Token Refresh**: Access tokens expire after 15 minutes. Implement auto-refresh on 401 responses.
2. **Storage**: Store access token in memory. Refresh token handled by browser cookies.
3. **Error Handling**: Always check `status` field and implement retry logic for 500 errors.
4. **Rate Limiting**: No rate limit yet, but coming soon.

---

Generated by Windsurf Agent - Complete API Documentation
DOCS

echo "   ✓ API documentation completed"

agent-tasks done "api-docs"

# ============================================
# 6. End Session
# ============================================
echo "6️⃣ Ending session..."

wrap "Windsurf: Complete API documentation written with curl examples and auth flow."

echo ""
echo "✅ WINDSURF SESSION COMPLETE"
echo ""
echo "Summary:"
echo "  - Tasks completed: 1/9"
echo "  - Decisions logged: 1"
echo "  - Progress shared: windsurf-state.md"
echo ""
