# Development Guide

Complete guide for developing Session Wrap Backend and Dashboard (v3.9.0).

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Git

### Setup

```bash
# If working inside the YD 2026 workspace
cd ~/YD\ 2026/projects/tools/session-wrap-backend

# Or clone this repo standalone
# git clone https://github.com/redredchen01/session-wrap-backend.git
# cd session-wrap-backend

# Backend setup
npm install
cp .env.example .env
npm run db:init

# Frontend setup (from the backend project root)
cd web
npm install
npm run build
cd ..

# Start development
npm run dev              # Terminal 1: Backend on :3000
cd web && npm run dev    # Terminal 2: Frontend on :5173 (from project root)
```

### Environment Variables

Backend (`.env`):
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/session_wrap
PORT=3000

# Auth
JWT_SECRET=your-secret-key

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Integrations
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
GITHUB_TOKEN=ghp_...
JIRA_HOST=https://domain.atlassian.net
```

Frontend (`.env` in web/):
```bash
VITE_API_URL=http://localhost:3000
```

---

## Backend Development

### Project Structure

```
src/
├── index.js              # Express app entry point
├── db/
│   ├── init.js          # Database initialization
│   └── schema.sql       # Database schema
├── middleware/
│   ├── errorHandler.js  # Error handling
│   ├── authorization.js # RBAC middleware
│   └── agent-auth.js    # Agent authentication
├── routes/
│   ├── auth.js          # Authentication
│   ├── users.js         # User endpoints
│   ├── wraps.js         # Session wrap endpoints
│   ├── rbac.js          # RBAC endpoints
│   ├── analytics.js     # Analytics endpoints
│   └── integrations.js  # Integration endpoints
├── cache/
│   └── redis.js         # Redis cache layer
├── integrations/
│   ├── slack.js         # Slack webhook
│   ├── github.js        # GitHub sync
│   └── jira.js          # Jira sync
├── models/
│   └── (database models)
└── utils/
    └── (utility functions)
```

### Running Backend

```bash
# Development
npm run dev              # With nodemon auto-reload

# Production
npm start

# Tests
npm test

# Database init
npm run db:init
```

### Database Schema

Key tables:
- `users` - User accounts
- `workspaces` - Multi-tenant workspaces
- `user_roles` - User role assignments
- `roles` - Role definitions
- `resource_permissions` - Fine-grained permissions
- `tasks` - Session tasks
- `decisions` - Decision logs
- `comments` - Comments with @mentions
- `analytics_snapshots` - Analytics snapshots
- `integrations` - Integration configs
- `integration_events` - Integration event log

### Adding New Endpoints

1. Create route handler in `src/routes/`
2. Add middleware if needed (auth, validation)
3. Document in `docs/API.md`
4. Add tests in `__tests__/` directory
5. Update CHANGELOG.md

Example:
```javascript
// src/routes/example.js
const express = require('express')
const router = express.Router()

router.get('/example', (req, res) => {
  res.json({ message: 'Example endpoint' })
})

module.exports = router
```

---

## Frontend Development

### Project Structure

```
web/
├── src/
│   ├── index.tsx        # React entry point
│   ├── App.tsx          # Root component
│   ├── main.tsx         # Vite entry
│   ├── components/      # Reusable components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom hooks
│   ├── api/             # API client
│   ├── types/           # TypeScript types
│   ├── styles/          # Global styles
│   ├── test/            # Test utilities
│   └── utils/           # Utility functions
├── tests/
│   └── e2e/             # Playwright E2E tests
├── public/              # Static assets
├── dist/                # Build output
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript config
├── tailwind.config.js   # Tailwind config
├── playwright.config.ts # Playwright config
└── vitest.config.ts     # Vitest config
```

### Running Frontend

```bash
# Development
npm run dev              # Hot reload on :5173

# Preview build
npm run preview          # Build preview on :4173

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Testing
npm test                 # Unit tests
npm run test:ui          # Test UI
npm run test:coverage    # Coverage report
npm run test:e2e         # E2E tests
npm run test:e2e:ui      # E2E with UI
```

### Adding New Components

1. Create component in `src/components/`
2. Export from `src/components/index.ts` (if barrel export exists)
3. Add unit tests in `src/components/__tests__/`
4. Wrap with `React.memo()` if it's a performance-critical component
5. Document in `docs/COMPONENTS.md`

Example:
```typescript
// src/components/MyComponent.tsx
import { memo } from 'react'

interface MyComponentProps {
  title: string
}

const MyComponentImpl = ({ title }: MyComponentProps) => {
  return <div>{title}</div>
}

export const MyComponent = memo(MyComponentImpl)
```

### Adding New Hooks

1. Create hook in `src/hooks/`
2. Export from `src/hooks/index.ts`
3. Add tests in `src/hooks/__tests__/`
4. Document in `docs/COMPONENTS.md`

Example:
```typescript
// src/hooks/useMyHook.ts
import { useState, useEffect } from 'react'

export const useMyHook = (param: string) => {
  const [state, setState] = useState(null)

  useEffect(() => {
    // Side effect
  }, [param])

  return { state }
}
```

### Adding New Pages

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link in `src/components/Sidebar.tsx`
4. Document in `docs/COMPONENTS.md`

### API Client

Located in `src/api.ts`:
- Axios-based client
- Centralized endpoint definitions
- Error handling
- Request/response interceptors

Example:
```typescript
import { api } from './api'

const response = await api.get('/api/users/profile')
```

---

## Testing Strategy

### Unit Tests

Using Vitest + React Testing Library:

```bash
npm test                # Run all tests
npm run test:ui         # Interactive UI
npm run test:coverage   # Coverage report
```

**Test Locations:**
- `src/components/__tests__/*.test.tsx`
- `src/hooks/__tests__/*.test.ts`

**Example:**
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyComponent } from '../MyComponent'

describe('MyComponent', () => {
  it('should render title', () => {
    render(<MyComponent title="Test" />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})
```

### E2E Tests

Using Playwright:

```bash
npm run test:e2e        # Run E2E tests
npm run test:e2e:ui     # Interactive mode
npm run test:e2e:debug  # Debug mode
```

**Test Locations:**
- `web/tests/e2e/*.spec.ts`

**Coverage:**
- Auth flow
- Dashboard interactions
- Workspace management
- Integration setup
- Settings page

**Example:**
```typescript
import { test, expect } from '@playwright/test'

test('should display dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  const heading = page.locator('h1')
  await expect(heading).toBeVisible()
})
```

### Test Setup

Files:
- `src/test/setup.ts` - Global test setup
- `src/test/utils.tsx` - Test utilities (custom render)

---

## Build & Deployment

### Frontend Build

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend/web
npm run build           # Production build

# Output in web/dist/
# - index.html
# - assets/index-*.css
# - assets/index-*.js
# - assets/recharts-*.js
```

**Build Stats:**
- Total size: 184KB gzip
- HTML: 0.56KB
- CSS: 3.80KB
- Main JS: 33.32KB
- Recharts: 150.40KB (separate chunk)

### Backend Build

No build step required for Node.js backend. Deploy `src/` directly.

### Docker Setup

Create `Dockerfile`:
```dockerfile
FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup

**Development:**
```
API: http://localhost:3000
Frontend: http://localhost:5173
```

**Production:**
```
API: https://api.example.com
Frontend: https://example.com
```

---

## Git Workflow

### Branching Strategy

```
main            # Production
├── dev         # Development
└── feature/*   # Feature branches
```

### Commit Messages

Format: `type(scope): description`

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `test` - Tests
- `perf` - Performance
- `refactor` - Code refactor
- `chore` - Build/deps

**Examples:**
```
feat(auth): Add JWT token refresh
fix(dashboard): Fix chart rendering bug
docs(api): Update API documentation
test(components): Add Header component tests
perf(analytics): Memoize TrendChart component
```

### Pull Requests

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit
3. Push to remote: `git push origin feature/my-feature`
4. Create PR on GitHub
5. Get review approval
6. Merge to main
7. Delete feature branch

---

## Debugging

### Backend Debugging

```bash
# With inspector
node --inspect src/index.js

# In VS Code
# Add to .vscode/launch.json:
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/src/index.js"
    }
  ]
}
```

### Frontend Debugging

```bash
# Browser DevTools (F12)
# - React Developer Tools extension
# - Redux DevTools extension

# Playwright debugging
npm run test:e2e:debug

# VS Code debugger
# Add to .vscode/launch.json:
{
  "type": "chrome",
  "request": "launch",
  "name": "Vite Dev Server",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/web/src"
}
```

### Common Issues

1. **Port already in use**
   ```bash
   # Kill process on port 3000
   lsof -i :3000
   kill -9 <PID>
   ```

2. **Database connection error**
   - Check DATABASE_URL
   - Verify PostgreSQL is running
   - Run `npm run db:init`

3. **CORS errors**
   - Check ALLOWED_ORIGINS
   - Verify frontend port in .env
   - Clear browser cache

4. **Module not found**
   - Run `npm install` in affected directory
   - Check import paths (case-sensitive on Linux)

---

## Performance Profiling

### Frontend

```javascript
// React DevTools Profiler
- Open DevTools > Profiler
- Record interactions
- Analyze component render times
- Identify unnecessary re-renders
```

### Backend

```bash
# Monitor with clinic.js
npm install -g clinic
clinic doctor npm start
```

---

## Code Quality

### Linting

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend/web
npm run lint            # Check code
npm run lint -- --fix   # Auto-fix issues
```

### Type Checking

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend/web
npm run type-check      # TypeScript strict mode
```

### Coverage Report

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend/web
npm run test:coverage   # Generate coverage
# Open coverage/index.html in browser
```

---

## Documentation

- **API Docs**: `docs/API.md`
- **Component Docs**: `docs/COMPONENTS.md`
- **Development Guide**: `docs/DEVELOPMENT.md` (this file)
- **Changelog**: `CHANGELOG.md`
- **README**: `README.md`

Update docs when:
- Adding new endpoints
- Adding new components
- Changing API structure
- Releasing new version

---

## Version Management

Update version in:
1. `package.json` (backend)
2. `web/package.json` (frontend)
3. `CHANGELOG.md` (release notes)
4. `web/src/components/Sidebar.tsx` (display version)

Example:
```bash
# Patch release (bug fix)
npm version patch       # 3.8.0 → 3.8.1

# Minor release (new feature)
npm version minor       # 3.8.0 → 3.9.0

# Major release (breaking change)
npm version major       # 3.8.0 → 4.0.0
```

---

## Resources

- [Express.js](https://expressjs.com/)
- [React 18](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Recharts](https://recharts.org/)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)
- [PostgreSQL](https://www.postgresql.org/)

---

## Getting Help

1. Check existing documentation
2. Search GitHub issues
3. Review CHANGELOG for similar changes
4. Check git history: `git log --grep="keyword"`
5. Ask in team Slack channel

---

**Happy coding!** 🚀
