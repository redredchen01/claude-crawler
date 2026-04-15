# React Components Documentation

Complete guide to Session Wrap Dashboard components (v3.9.0).

## Component Structure

Components follow atomic design patterns organized by responsibility:

```
src/components/
├── Layout
│   ├── Header.tsx          # Top navigation
│   └── Sidebar.tsx         # Left navigation
├── Dashboard
│   ├── AnalyticsDashboard.tsx
│   ├── TrendChart.tsx
│   ├── AgentLeaderboard.tsx
│   ├── KPICard (internal)
│   └── InsightCard (internal)
├── Management
│   ├── WorkspaceSelector.tsx
│   ├── RoleManager.tsx
│   └── IntegrationManager.tsx
└── Pages (in src/pages/)
    ├── HomePage.tsx
    ├── DashboardPage.tsx
    ├── WorkspacesPage.tsx
    ├── RolesPage.tsx
    ├── IntegrationsPage.tsx
    └── SettingsPage.tsx
```

---

## Layout Components

### Header

Top navigation bar with workspace selector and user menu.

**Props:**
```typescript
interface HeaderProps {
  title?: string  // Page title (default: 'Dashboard')
}
```

**Features:**
- Dynamic page title
- Workspace selector dropdown
- User display (GitHub login)
- Logout button
- CORS-enabled for localhost:3001

**Usage:**
```tsx
<Header title="Analytics Dashboard" />
```

**Performance:** Memoized with React.memo to prevent unnecessary re-renders.

---

### Sidebar

Left navigation menu with active state highlighting.

**Navigation Items:**
- Home `/`
- Analytics `/dashboard`
- Workspaces `/workspaces`
- Roles & Members `/roles`
- Integrations `/integrations`
- Settings `/settings`

**Features:**
- Active link highlighting
- Version display (v3.9.0)
- Responsive icon sizing
- Smooth transitions

**Performance:** Memoized with React.memo.

---

## Dashboard Components

### AnalyticsDashboard

Main analytics view with KPIs, trends, and insights.

**Props:**
```typescript
interface AnalyticsDashboardProps {
  workspaceId?: string | null  // Override current workspace
}
```

**Features:**
- 4 KPI cards (task completion %, total tasks, decision quality, active agents)
- Time range selector (7/30/90 days)
- Trend chart with multi-line visualization
- Agent leaderboard (top performers)
- Key insights cards
- Task status breakdown

**Data Structure:**
```typescript
interface AnalyticsDashboard {
  snapshot: AnalyticsSnapshot
  trends: AnalyticsTrend[]
  insights: Insight[]
  agents: AgentPerformance[]
}
```

**Performance:**
- Memoized component
- Memoized sub-components (KPICard, InsightCard)
- Lazy-loaded chart data
- Data fetched via useAnalytics hook with caching

---

### TrendChart

Multi-line chart showing 4 metrics over time.

**Props:**
```typescript
interface TrendChartProps {
  data: AnalyticsTrend[]  // Array of trend snapshots
}
```

**Lines Displayed:**
1. Completed Tasks (green)
2. In Progress Tasks (blue)
3. Pending Tasks (yellow)
4. Decision Quality (%) (purple)

**Features:**
- Recharts LineChart component
- Tooltip on hover
- Legend for metric identification
- Date formatting (MMM DD)
- Responsive height (300px)

**Performance:**
- Memoized with React.memo
- useMemo for data transformation
- Efficient Recharts rendering

**Example Data:**
```typescript
[
  {
    snapshot_date: "2026-03-25T00:00:00Z",
    completed_tasks: 100,
    pending_tasks: 15,
    in_progress_tasks: 10,
    total_decisions: 30,
    avg_decision_quality: 4.2
  }
]
```

---

### AgentLeaderboard

Performance ranking table with medal indicators.

**Props:**
```typescript
interface AgentLeaderboardProps {
  agents: AgentPerformance[]
}
```

**Columns:**
| Column | Type | Description |
|--------|------|-------------|
| Rank | Medal (🥇🥈🥉) | Position with medals for top 3 |
| Agent | String | Agent identifier/name |
| Created | Number | Tasks created count |
| Completed | Number | Tasks completed count |
| Comments | Number | Total comments added |
| Decisions | Number | Decisions logged count |
| Avg Time | Number | Average response time (ms) |
| Efficiency | Score | Calculated efficiency score (0-5) |

**Performance:** Memoized with React.memo.

---

### KPICard

Individual KPI display card.

**Props:**
```typescript
interface KPICardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: string
  color: 'blue' | 'green' | 'yellow' | 'purple'
}
```

**Features:**
- Color-coded backgrounds (blue, green, yellow, purple)
- Large value display
- Optional trend indicator
- Icon support

**Example:**
```tsx
<KPICard
  title="Task Completion"
  value="85.3%"
  icon="📊"
  trend="+5% from last period"
  color="blue"
/>
```

**Performance:** Memoized with React.memo.

---

## Management Components

### WorkspaceSelector

Grid view of all workspaces with create functionality.

**Features:**
- Grid layout (responsive)
- Workspace cards with name and owner
- Public/private indicator
- Create workspace modal dialog
- Create workspace form with name and privacy toggle

**Modal Form Fields:**
- Name (required, string)
- Is Public (toggle, boolean)

---

### RoleManager

Member list with role assignment interface.

**Features:**
- Member table with GitHub login, email, roles
- Add member modal dialog
- Edit member modal for role changes
- Remove member confirmation
- Role dropdown selector

**Modal Forms:**
- Add Member: GitHub login, role selection
- Edit Member: role dropdown
- Remove: Confirmation dialog

---

### IntegrationManager

Setup and manage external integrations.

**Supported Integrations:**
1. **Slack**
   - Webhook URL configuration
   - Channel ID configuration
   - Event notification toggle
   - Test connection button

2. **GitHub**
   - API token configuration
   - Org/repo selection
   - Issue sync toggle
   - Test connection button

3. **Jira**
   - Host URL configuration
   - API token configuration
   - Project key configuration
   - Story point mapping toggle

**Features:**
- Individual cards per integration
- Setup/Connect buttons
- Toggle enable/disable
- Delete integration
- Connection test with feedback

---

## Pages

### HomePage

Welcome dashboard with feature overview and quick stats.

**Features:**
- Feature cards (tasks, decisions, integrations, analytics)
- Current workspace quick stats
- Getting started guide
- Quick action buttons

---

### DashboardPage

Analytics dashboard wrapper.

**Query Parameters:**
- `workspace` - Override workspace ID

**Content:** Wraps AnalyticsDashboard component.

---

### WorkspacesPage

Workspace management page.

**Content:** Wraps WorkspaceSelector component.

---

### RolesPage

Member and role management page.

**Content:** Wraps RoleManager component.

---

### IntegrationsPage

External integrations setup page.

**Content:** Wraps IntegrationManager component.

---

### SettingsPage

Account settings and preferences.

**Sections:**
1. **Account Info**
   - GitHub login display
   - Email display
   - Account creation date

2. **Preferences**
   - Notifications toggle
   - Analytics digest toggle
   - Slack integration toggle

3. **Theme**
   - Light/Dark/System selector

---

## Custom Hooks

### useAuth

Authentication state management.

```typescript
interface UseAuthReturn {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  error: string | null
}
```

---

### useWorkspace

Workspace management.

```typescript
interface UseWorkspaceReturn {
  currentWorkspace: Workspace | null
  workspaces: Workspace[]
  members: WorkspaceMember[]
  setCurrentWorkspace: (workspace: Workspace | null) => void
  addMember: (login: string, role: string) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  updateMember: (userId: string, role: string) => Promise<void>
  isLoading: boolean
  error: string | null
}
```

---

### useAnalytics

Analytics data fetching with time range.

```typescript
interface UseAnalyticsReturn {
  dashboard: AnalyticsDashboard | null
  insights: Insight[]
  agents: AgentPerformance[]
  isLoading: boolean
  error: string | null
  days: number
  setDays: (days: 7 | 30 | 90) => void
}
```

---

### useApi

Generic API call wrapper.

```typescript
interface UseApiReturn<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  execute: (url: string, options?: AxiosRequestConfig) => Promise<T>
  reset: () => void
}
```

---

## Styling

### Tailwind CSS

All components use Tailwind CSS for styling:
- Color palette: slate, blue, green, yellow, purple
- Spacing scale: 4px base unit
- Border radius: 0.5rem default
- Shadows: shadow-sm for cards, shadow-lg for modals

### CSS Classes

Common classes used:
- `.card` - White background with border and shadow
- `.input` - Form input styling
- `.btn` - Button styling
- `.btn-secondary` - Secondary button variant
- `.btn-sm` - Small button variant

---

## Testing

### Unit Tests

Located in `src/components/__tests__/`:
- `Sidebar.test.tsx` - Navigation and version display
- `Header.test.tsx` - Title, user display, logout
- `useAuth.test.ts` - Login/logout, auth flow
- `useWorkspace.test.ts` - Workspace operations

### E2E Tests

Located in `web/tests/e2e/`:
- `auth.spec.ts` - Authentication and navigation
- `dashboard.spec.ts` - Dashboard rendering and interaction
- `workspaces.spec.ts` - Workspace and member management
- `integrations.spec.ts` - Integration setup and settings

**Run Tests:**
```bash
npm test                    # Unit tests
npm run test:e2e           # E2E tests
npm run test:e2e:ui        # E2E with UI
npm run test:e2e:debug     # E2E with debugging
```

---

## Performance Optimization

### React.memo

Applied to components that receive stable props:
- Header
- Sidebar
- AnalyticsDashboard
- KPICard
- InsightCard
- TrendChart
- AgentLeaderboard

### useMemo

Applied to expensive computations:
- TrendChart: Data transformation
- Charts: Data aggregation
- Analytics: Calculation-heavy operations

### Code Splitting

Vite automatically code-splits:
- Recharts: ~150KB (separate chunk)
- Main app: ~33KB gzip

---

## Accessibility

Components follow WCAG 2.1 guidelines:
- Semantic HTML elements
- ARIA labels for form inputs
- Keyboard navigation support
- Color contrast ratios >= 4.5:1
- Focus indicators for interactive elements

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Development Guidelines

1. **Always read before editing** - Understand existing patterns
2. **Use TypeScript** - Strict mode enabled
3. **Memoize expensive components** - Improve performance
4. **Write tests** - Unit tests for new components
5. **Follow naming conventions** - PascalCase for components
6. **Document props** - Use JSDoc comments
7. **Keep components small** - Single responsibility
8. **Reuse hooks** - DRY principle for state logic
