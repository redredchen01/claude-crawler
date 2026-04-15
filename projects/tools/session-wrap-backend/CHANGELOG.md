# Changelog

All notable changes to the Session Wrap Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.10.0] - 2026-03-27

### Added - Phase 10A: Advanced Analytics & Forecasting

#### Phase 10A - Time Series Forecasting & Anomaly Detection
- **Database Schema:**
  - `analytics_forecasts` table - Stores forecast predictions with confidence bounds
  - `anomaly_detections` table - Tracks detected anomalies with severity levels
  - `forecast_feedback` table - Records user feedback for model improvement
  - 7 new performance indexes for workspace_id, metric_type, severity, dates

- **Forecasting Engine (src/utils/forecast.js):**
  - Exponential smoothing with configurable alpha (0-1)
  - Holt's double exponential smoothing for trend capture
  - Z-score based anomaly detection with severity classification
  - Moving average forecasting with window-based predictions
  - Seasonal decomposition separating trend/seasonal/residual components

- **API Endpoints (src/routes/forecasting.js):**
  - `GET /api/forecasting/forecast/:workspaceId` - Holt's method predictions (10+ periods, confidence bounds)
  - `GET /api/forecasting/anomalies/:workspaceId` - Z-score anomalies (critical/high/medium severity)
  - `GET /api/forecasting/insights/:workspaceId` - AI insights from forecasts & anomalies
  - `POST /api/forecasting/feedback/:forecastId` - Feedback on forecast accuracy
  - `GET /api/forecasting/history/:workspaceId` - Forecast history with pagination

- **Frontend Components:**
  - `ForecastChart.tsx` - Recharts area chart with confidence bounds
  - `AnomalyViewer.tsx` - Severity-based anomaly display with statistics
  - `ForecastInsights.tsx` - AI recommendations with metric-specific insights
  - `useForecasting()` hook - Data fetching for forecast/anomaly/insight data

- **Integration:**
  - Added "Advanced Analytics & Forecasting" section to AnalyticsDashboard
  - Metric type selector (completed_tasks, pending_tasks, in_progress_tasks, total_decisions)
  - Real-time forecast updates when changing metrics

- **Testing:**
  - 40+ unit tests for forecast algorithms (exponential, Holt, anomaly detection)
  - E2E tests for forecasting workflow
  - Anomaly severity classification validation
  - Confidence bounds correctness checks

- **Documentation:**
  - Complete API docs for 5 forecasting endpoints
  - Algorithm explanation and parameter documentation
  - Component usage examples and prop interfaces

### Changed
- AnalyticsDashboard enhanced with Advanced Analytics section
- types.ts updated with ForecastData, AnomalyData, ForecastInsight interfaces

---

## [3.9.0] - 2026-03-27

### Added - Phase 9: Frontend-Backend Integration & Optimization

#### Phase 9A - Core Components & Hooks
- React 18 dashboard with TypeScript strict mode
- Custom hooks:
  - `useAuth()` - Authentication state management with JWT
  - `useWorkspace()` - Workspace and member operations
  - `useAnalytics()` - Time-configurable analytics data fetching
  - `useApi()` - Generic API wrapper with error handling
- Core components:
  - Header with workspace selector and user menu
  - Sidebar with active navigation highlighting
  - Version display (v3.9.0)

#### Phase 9B - Analytics & Management UI
- AnalyticsDashboard with KPI cards (completion %, total tasks, decision quality, active agents)
- TrendChart for 7/30/90 day metrics visualization using Recharts
- AgentLeaderboard with performance metrics and medals (🥇🥈🥉)
- WorkspaceSelector with grid view and create workspace modal
- RoleManager for member management and role assignments
- IntegrationManager for Slack/GitHub/Jira setup

#### Phase 9C - Page Layout & Routing
- React Router v6 deep linking support
- 6 main pages:
  - HomePage - Welcome dashboard with quick stats
  - DashboardPage - Analytics and trends
  - WorkspacesPage - Workspace management
  - RolesPage - Member and role management
  - IntegrationsPage - External tool setup
  - SettingsPage - Account and preferences
- Responsive layout with Sidebar and Header
- Query parameter support for workspace context (?workspace=id)

#### Phase 9D - Testing Framework
- Vitest unit testing with happy-dom environment
- Coverage thresholds: 70% lines/functions, 65% branches
- React Testing Library integration
- Component and hook tests
- Mock setup for auth service and API calls

#### Phase 9E - Frontend-Backend Integration
- Express static file serving for React build (web/dist/)
- CORS configuration for localhost:3001 development server
- SPA fallback route for React Router deep linking
- Proper static middleware ordering for API/frontend separation

#### Phase 9F - E2E Testing
- Playwright E2E test configuration
- Test suites for:
  - Authentication flow and navigation
  - Dashboard rendering and features
  - Workspace and member management
  - Integration setup UI
  - Settings and preferences
- Multi-browser testing (Chromium, Firefox, WebKit)
- Screenshot and video capture on failures

#### Phase 9G - Performance Optimization
- React.memo memoization for components:
  - Header, Sidebar (navigation optimization)
  - AnalyticsDashboard, KPICard, InsightCard
  - TrendChart, AgentLeaderboard
- useMemo for expensive computations (chart data transformation)
- Recharts lazy loading support for large datasets
- Reduces unnecessary re-renders and improves FCP

### Dependencies Added (Frontend)
- `@playwright/test` - E2E testing framework
- Existing: React 18, Router v6, Recharts, Tailwind CSS, Vitest

### Configuration Changes
- playwright.config.ts - Multi-browser E2E setup
- Express.static() - Frontend static asset serving
- CORS updated to allow http://localhost:3001
- test:e2e scripts added to web/package.json

### Documentation
- Component structure follows atomic design pattern
- Hook composition for state management
- TypeScript strict mode for type safety
- Vitest configuration with setup files

## [3.8.0] - 2026-03-27

### Added - Phase 8: Enterprise Features

#### Phase 8A - RBAC (Role-Based Access Control)
- New tables: `roles`, `user_roles`, `resource_permissions`, `workspaces`
- Authorization middleware: `checkRole()`, `checkResourcePermission()`
- RBAC API endpoints:
  - `GET/POST /api/workspaces` - Workspace management
  - `POST/PUT/DELETE /api/workspaces/:id/members` - Member management
  - `GET /api/me/permissions` - User permission query
  - `GET /api/permissions/check` - Permission verification
  - `GET /api/roles` - List available roles
- Default roles: admin, editor, viewer
- Support for multi-tenant workspaces

#### Phase 8B - Analytics Dashboard
- New tables: `analytics_snapshots`, `decision_analytics`, `agent_performance`
- Analytics API endpoints:
  - `GET /api/analytics/dashboard/:workspaceId` - Dashboard snapshot
  - `GET /api/analytics/trends/:workspaceId` - Trend analysis
  - `GET /api/analytics/agents/:workspaceId` - Agent performance metrics
  - `GET /api/analytics/decisions/:workspaceId` - Decision analytics
  - `GET /api/analytics/insights/:workspaceId` - AI-generated insights
- KPI calculation and trend trending
- Automated insight generation based on metrics
- Agent performance scoring and leaderboards

#### Phase 8C - External Integrations
- New tables: `integrations`, `integration_events`
- Integration framework supporting:
  - Slack Webhook integration (real-time notifications)
  - GitHub API integration (issue sync)
  - Jira API integration (story point sync)
- Integration management endpoints:
  - `GET/POST /api/integrations/:workspaceId` - Config management
  - `PUT /api/integrations/:integrationId/toggle` - Enable/disable
  - `DELETE /api/integrations/:integrationId` - Remove integration
  - `GET /api/integrations/:integrationId/events` - Event history
- Service-specific test endpoints for connection verification
- Integration event logging for auditing and debugging

#### Phase 8D - Performance Optimization
- Redis cache layer with in-memory fallback
- Cache module: `src/cache/redis.js`
- Configurable TTL for different data types:
  - Tasks: 5 minutes
  - Decisions: 10 minutes
  - Analytics: 1 hour
  - User permissions: 2 minutes
  - Workspace members: 5 minutes
- Cache key generation and pattern-based invalidation
- Graceful degradation when Redis is unavailable

### Database Schema Updates
- Added 8 new tables supporting enterprise features
- Added 14 new indexes for query optimization
- Backward compatible with existing schema

### Dependencies Added
- `ioredis` (optional, for Redis caching)
- All integrations use existing `axios` dependency

### API Changes
- All new endpoints under `/api/` namespace
- JWT authentication required for protected routes
- Supports workspace-scoped and global operations

## [3.7.0] - 2026-03-26

### Phase 7: Interactive Dashboard

#### Phase 7A - WebSocket Real-time Sync
- Replaced HTTP polling with WebSocket
- Bidirectional real-time updates
- Auto-reconnection with exponential backoff
- Fallback to polling on connection failure

#### Phase 7B - Task Editing CRUD
- Full create, read, update, delete operations from UI
- Form validation and error handling
- Real-time sync across clients

#### Phase 7C - Decision Search & Filtering
- Full-text search for decisions
- Multi-dimensional filtering (tags, status, priority)
- Search result ranking and pagination

#### Phase 7D - Team Collaboration
- Activity feed showing all changes
- Comments system for discussion
- @mention support for user notifications

---

## [3.6.0] - 2026-03-10

### Added
- Web dashboard MVP
- Basic task management
- Memory statistics display
- Agent sync status tracking

---

## [3.5.1] and earlier

Initial releases with basic session wrap storage and CLI integration
