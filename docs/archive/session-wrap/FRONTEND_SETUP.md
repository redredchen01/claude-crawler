# Frontend Setup & Development

## Quick Start

```bash
cd ~/YD\ 2026/session-wrap-frontend
npm install
npm run dev
```

Open `http://localhost:5173`

## Directory Structure

```
session-wrap-frontend/
├── src/
│   ├── pages/         # Page components (Login, Dashboard, etc.)
│   ├── components/    # Reusable components (Layout, Nav)
│   ├── store/         # Zustand state management
│   ├── App.tsx        # Main app + routing
│   ├── main.tsx       # Entry point
│   └── index.css      # Global styles (Tailwind)
├── index.html         # HTML template
├── vite.config.ts     # Vite configuration
├── tailwind.config.js # Tailwind CSS config
├── tsconfig.json      # TypeScript config
├── package.json       # Dependencies
└── README.md          # Documentation
```

## Available Pages

### 1. Login (`/login`)
- Claude Code token verification
- GitHub login
- Email (optional)

### 2. Dashboard (`/`)
- Storage metrics
- Wrap statistics
- Quick start guide

### 3. History (`/history`)
- All user wraps
- Pagination
- Wrap details (date, size, files)

### 4. Profile (`/profile`)
- User information
- Subscription status
- Account details

## Development Commands

```bash
npm run dev        # Start dev server (Vite HMR enabled)
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run type-check # TypeScript type checking
```

## State Management

Using Zustand for authentication state:

```typescript
const { token, user, login, logout } = useAuthStore()
```

Automatically persisted to localStorage under `auth-storage`

## API Integration

Backend API URL from environment:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
```

All requests include Authorization header with JWT token.

## Styling

Uses Tailwind CSS utility classes. Configuration in `tailwind.config.js`

### Common Classes
- `bg-blue-600` — Blue background
- `text-gray-900` — Dark gray text
- `shadow` — Box shadow
- `rounded-lg` — Rounded corners
- `px-4 py-2` — Padding

## Next Steps

1. ✅ Frontend structure created
2. ⏳ API integration (Backend must be running)
3. ⏳ Testing & QA
4. ⏳ Deployment

## Backend Connection

Ensure backend is running:
```bash
cd ~/YD\ 2026/session-wrap-backend
npm install
docker-compose up
```

Backend will be available at `http://localhost:3000`

Frontend will proxy `/api/*` requests to backend (see vite.config.ts)

## Troubleshooting

### Port 5173 already in use
```bash
npm run dev -- --port 3001
```

### API connection issues
1. Check backend is running (`http://localhost:3000/health`)
2. Check VITE_API_URL in .env
3. Check CORS configuration in backend

### Authentication fails
1. Verify Claude Code token format
2. Check backend auth endpoint logs
3. Ensure token is valid and not expired

---

**Ready to dev!** 🚀
