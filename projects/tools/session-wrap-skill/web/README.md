# Session Wrap Dashboard

🎯 Real-time multi-agent project coordination and memory management dashboard.

## Features

- **Task Visualization** — Monitor task status across pending, in-progress, and completed columns
- **Decision Timeline** — View all project decisions with reasoning and trade-offs
- **Memory Usage** — Track memory growth, breakdown by category, and historical trends
- **Sync Status** — Real-time agent connection status and coordination state
- **Live Updates** — Auto-refreshing data every 5 seconds with fallback polling

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure your backend API URL:

```env
VITE_API_URL=http://localhost:3000/api
```

If using Railway backend:

```env
VITE_API_URL=https://your-railway-app.up.railway.app/api
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Vercel will auto-detect Vite and build automatically. Set environment variables in Vercel dashboard:

```
VITE_API_URL=https://your-backend-url/api
```

### Docker

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

Build and run:

```bash
docker build -t session-wrap-dashboard .
docker run -e VITE_API_URL=http://api:3000/api -p 3000:3000 session-wrap-dashboard
```

## Architecture

### Components

- **TaskBoard** — Task status visualization (pending/in-progress/completed)
- **DecisionTimeline** — Decision history with reasoning chains
- **MemoryStats** — Memory usage metrics, breakdown, and trends
- **SyncStatus** — Agent connection status and sync state

### Data Flow

```
App.tsx
  ├─ useEffect: Load state + subscribe to updates
  ├─ apiClient.getDashboardState()
  └─ Re-render on state changes
    ├─ TaskBoard (tasks)
    ├─ DecisionTimeline (decisions)
    ├─ MemoryStats (memory)
    └─ SyncStatus (sync)
```

### API Client

The `api.ts` module provides:

- `getTasks()` — Fetch all tasks from backend
- `getDecisions()` — Fetch decision history
- `getMemoryStats()` — Fetch memory usage breakdown
- `getSyncStatus()` — Fetch real-time sync state
- `getDashboardState()` — Fetch all data (parallel requests)
- `subscribeToUpdates(callback, interval)` — Poll for live updates

## Styling

Uses Tailwind CSS (via `index.css`) with:

- Utility-first responsive design
- Inter font for clean typography
- Light color scheme with accessible contrast
- Smooth transitions and animations

## Backend Integration

Requires a backend API with these endpoints:

```
GET  /api/tasks              → { tasks: Task[] }
GET  /api/decisions          → { decisions: Decision[] }
GET  /api/memory/stats       → { stats: MemoryStat[] }
GET  /api/sync/status        → { status: SyncStatus }
PATCH /api/tasks/:id         → Update task (future)
```

See `PRODUCTION-SETUP.md` for backend deployment.

## Roadmap (Phase 7+)

- ✅ Task visualization (MVP)
- ✅ Decision timeline (MVP)
- ✅ Memory stats (MVP)
- ✅ Sync status (MVP)
- 🔲 Task creation/editing from UI
- 🔲 Decision filtering and search
- 🔲 Multi-project view
- 🔲 Team collaboration (comments, @mentions)
- 🔲 Custom filters and aggregations
- 🔲 WebSocket real-time updates (replace polling)

## File Structure

```
web/
├── src/
│   ├── components/
│   │   ├── TaskBoard.tsx        # Task status visualization
│   │   ├── DecisionTimeline.tsx # Decision history
│   │   ├── MemoryStats.tsx      # Memory usage metrics
│   │   └── SyncStatus.tsx       # Agent sync status
│   ├── api.ts                   # Backend API client
│   ├── types.ts                 # TypeScript types
│   ├── App.tsx                  # Main app component
│   ├── App.css                  # Component styles
│   ├── index.css                # Global styles + Tailwind
│   └── main.tsx                 # React entry point
├── index.html                   # HTML entry point
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript config
├── vercel.json                  # Vercel deployment config
└── README.md                    # This file
```

## Technology Stack

- **Framework:** React 18 + TypeScript
- **Bundler:** Vite
- **Styling:** Tailwind CSS (via manual styles)
- **Charts:** Recharts (for memory trends)
- **Icons:** Lucide React
- **HTTP Client:** Axios
- **Deployment:** Vercel

## Contributing

See `CONTRIBUTING.md` in the root directory.

## License

MIT
