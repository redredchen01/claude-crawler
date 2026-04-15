# Phase 9.2 - Authentication & Authorization Guide

## Overview

Complete authentication system with JWT tokens, API keys, and role-based access control (RBAC).

## Authentication Methods

### 1. JWT Token Authentication

**Register:**
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "secure-password",
    "role": "editor"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secure-password"
  }'

Response:
{
  "id": 1,
  "username": "john",
  "email": "john@example.com",
  "role": "editor",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Using Token:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:3001/api/jobs
```

### 2. API Key Authentication

**Generate API Key:**
```bash
curl -X POST http://localhost:3001/auth/api-keys \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "expiresAt": "2027-04-15T00:00:00Z"
  }'

Response:
{
  "id": 1,
  "key": "sk_abcdef123456...",
  "name": "Production API Key",
  "createdAt": "2026-04-15T10:00:00Z",
  "expiresAt": "2027-04-15T00:00:00Z"
}
```

**Using API Key:**
```bash
curl -H "X-API-Key: sk_abcdef123456..." \
  http://localhost:3001/api/jobs
```

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| **admin** | All operations, user management, system config |
| **editor** | Create/edit jobs, manage own webhooks, full API access |
| **viewer** | Read-only access to jobs and results |

## Endpoints

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | None | Create new account |
| POST | `/auth/login` | None | Get JWT token |
| GET | `/auth/verify` | JWT | Verify current token |
| GET | `/auth/me` | JWT/Key | Get user profile |
| PATCH | `/auth/me` | JWT | Update profile |

### API Key Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/api-keys` | JWT | Generate new API key |
| GET | `/auth/api-keys` | JWT | List API keys |
| DELETE | `/auth/api-keys/:keyId` | JWT | Revoke API key |

### Protected Job Endpoints (require auth)

| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/jobs` | viewer | List user's jobs |
| POST | `/api/jobs` | editor | Create job |
| GET | `/api/jobs/:id` | viewer | Get job details |
| GET | `/api/jobs/:id/results` | viewer | Get results |

## Implementation

### Token Service

```typescript
import { TokenService } from './auth/tokenService';

// Generate JWT
const token = TokenService.generateToken(userId, username, role);

// Verify JWT
const payload = TokenService.verifyToken(token);

// Generate API Key
const apiKey = TokenService.generateApiKey();
const hash = TokenService.hashApiKey(apiKey);

// Verify password
const hash = TokenService.hashPassword(password);
const valid = TokenService.verifyPassword(password, hash);
```

### Middleware Usage

```typescript
import { authMiddleware, apiKeyMiddleware, flexibleAuthMiddleware, requireRole } from './auth/middleware';

// JWT only
router.get('/protected', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// API Key only
router.get('/key-protected', apiKeyMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// Either JWT or API Key
router.get('/flexible', flexibleAuthMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// RBAC - Require admin role
router.delete('/admin-only', authMiddleware, requireRole('admin'), async (c) => {
  return c.json({ message: 'Admin only' });
});

// RBAC - Multiple allowed roles
router.post('/jobs', authMiddleware, requireRole('admin', 'editor'), async (c) => {
  return c.json({ message: 'Admin or Editor' });
});
```

## Security Considerations

### 1. Token Storage

**Browser/Frontend:**
- Store JWT in httpOnly cookie (recommended)
- Or secure localStorage (less secure)
- Never expose in URL or HTML

**Backend/CLI:**
- Store API keys in secure vault
- Rotate regularly
- Use environment variables

### 2. Key Rotation

**API Keys:**
```bash
# Generate new key
POST /auth/api-keys with new name

# Revoke old key
DELETE /auth/api-keys/:oldKeyId

# Update client to use new key
```

### 3. Password Requirements

- Minimum 8 characters
- Mix of uppercase, lowercase, numbers, symbols
- Not reused in last 5 changes
- Changed at least annually

### 4. Token Expiration

- JWT tokens: 7 days (configurable)
- API Keys: configurable or no expiration
- Refresh tokens: 30 days (optional)

### 5. Rate Limiting

Implement per-user rate limits:
- Login: 5 attempts / 15 minutes
- API calls: 100 / minute (configurable by role)
- Password reset: 3 / day

## Best Practices

1. **Always use HTTPS** in production
2. **Rotate secrets** regularly (JWT_SECRET)
3. **Monitor failed logins** - implement lockout after 5 failures
4. **Audit all API access** - log to audit_log table
5. **Implement CORS properly** - restrict allowed origins
6. **Use secure cookies** - httpOnly, Secure, SameSite flags
7. **Implement 2FA** - for admin accounts
8. **API key versioning** - maintain multiple active keys for rotation

## Testing

### With cURL

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPass123!",
    "role": "editor"
  }' | jq '.token' -r > token.txt

# Use token
TOKEN=$(cat token.txt)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/auth/me

# Generate API key
curl -X POST http://localhost:3001/auth/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-key"}' | jq '.key' -r > apikey.txt

# Use API key
APIKEY=$(cat apikey.txt)
curl -H "X-API-Key: $APIKEY" \
  http://localhost:3001/auth/me
```

## Troubleshooting

### "Invalid or expired token"

- Token may have expired (7 days default)
- JWT_SECRET may have changed (causes all tokens to invalidate)
- Token may be malformed
- Solution: Generate new token with `/auth/login`

### "Invalid API key"

- Key hash doesn't match stored value
- API key deactivated
- User account disabled
- Solution: Regenerate API key with `/auth/api-keys`

### "Forbidden - role check failed"

- User role doesn't have permission for this action
- Solution: Use admin to upgrade user role in database directly

## Next Steps

- **Phase 9.3**: Real Claude API integration
- **Phase 9.4**: Monitoring and observability
- **Post-Phase 9**: 2FA, session management, OAuth integration

---

**Status:** ✅ Phase 9.2 Complete  
**Files:**
- `backend/src/auth/tokenService.ts` - JWT & crypto
- `backend/src/auth/middleware.ts` - Auth middleware
- `backend/src/routes/auth.ts` - Auth endpoints

**Version:** 1.0
