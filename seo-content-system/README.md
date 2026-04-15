# SEO Content Operating System

A comprehensive local-first platform for keyword research, clustering, and content planning. Complete the keyword research workflow: **seed keywords → expansion → normalization → classification → clustering → content planning**.

## 🎯 Overview

This system automates the SEO content planning process by:

1. **Expanding** seed keywords into long-tail variations (8 strategies)
2. **Normalizing** keywords (cleaning, deduplication, standardization)
3. **Classifying** keywords by intent, funnel stage, and content format
4. **Analyzing** competition and trend indicators
5. **Planning** content strategy based on keyword profiles
6. **Exporting** results in CSV/JSON for downstream tools

## ✨ Features

### Phase 1 (Current MVP)

- [x] **Keyword Expansion**: 8 configurable strategies
- [x] **Normalization**: Whitespace, case, punctuation, CJK handling
- [x] **Classification**: 4 intent types × 8 secondary intents × 3 funnel stages
- [x] **Trend Detection**: Pluggable provider system with caching
- [x] **SERP Analysis**: Heuristic competition scoring
- [x] **Async Processing**: p-queue with checkpoint recovery
- [x] **Export**: CSV/JSON with statistics
- [x] **Frontend**: Dashboard, project management, results browsing
- [x] **250+ Unit Tests**: Comprehensive test coverage

### Phase 4 & 6 (Completed)

- [x] **User Content Editing**: Brief/FAQ inline editing
- [x] **Publishing Tracker**: URL + timestamp tracking
- [x] **Real Trend Integration**: 90-day trend analysis, confidence scoring
- [x] **Production Deployment**: Live backend, monitoring, health checks

### Phase 8 (Completed)

- [x] **Webhook Filtering**: MongoDB-style conditional delivery with fail-closed error handling
  - Pattern matching on event payloads (7 operators: $gt, $lt, $gte, $lte, $ne, $in, $exists)
  - Synchronous filter evaluation before async delivery
  - Backward compatible (filters optional)
  - See: [Webhook Filtering Documentation](docs/solutions/integration-patterns/webhook-filtering-mongodb-dsl-2026-04-15.md)
- [x] **API Key Authentication**: Per-project scoping with rate limiting
- [x] **Advanced Metrics**: Prometheus integration, per-user quotas
- [x] **Webhook Signing**: HMAC-SHA256 signature validation

### Phase 2+ (Planned)

- [ ] Real SERP scraping (Playwright)
- [ ] Clustering algorithms (LSA, hierarchical)
- [ ] Content brief generation
- [ ] FAQ generation
- [ ] Internal link recommendations

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation & Running

**Backend:**
```bash
cd backend
npm install
npm run dev
# Starts on http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Starts on http://localhost:5173
```

Visit http://localhost:5173 to access the app.

### Testing

```bash
cd backend
npm test                    # Run all tests
npm test -- --watch        # Watch mode
```

## 🏗️ Architecture

**7-Layer Design:**

1. **Expansion** - Seeds → Candidates (8 configurable strategies)
2. **Normalization** - Clean & deduplicate
3. **Classification** - 4 dimensions (intent, funnel, format, confidence)
4. **Trend Detection** - Pluggable providers with cache
5. **SERP Analysis** - Heuristic competition scoring
6. **Job Queue** - Async processing with checkpoints
7. **Export** - CSV/JSON with aggregations & stats

## 📖 API Documentation

### Create Project
```bash
POST /api/projects
Content-Type: application/json
x-user-id: user-1

{
  "name": "Blog SEO",
  "siteName": "myblog.com",
  "locale": "en-US"
}
```

### Create Keyword Job
```bash
POST /api/projects/{projectId}/jobs
Content-Type: application/json
x-user-id: user-1

{
  "seedKeywords": ["python", "javascript"],
  "config": {
    "expandDepth": 1,
    "totalMaxCandidates": 1000,
    "strategies": ["original", "a_z_suffix", "question_modifiers"],
    "enableSerpAnalysis": false,
    "enableTrendDetection": false
  }
}
```

### Get Results
```bash
GET /api/projects/{projectId}/jobs/{jobId}/results?offset=0&limit=100
x-user-id: user-1
```

### Export as CSV
```bash
GET /api/projects/{projectId}/jobs/{jobId}/export/csv
x-user-id: user-1
```

### Export as JSON
```bash
GET /api/projects/{projectId}/jobs/{jobId}/export/json
x-user-id: user-1
```

### Get Statistics
```bash
GET /api/projects/{projectId}/jobs/{jobId}/stats
x-user-id: user-1
```

## 📊 Performance

| Operation | Scale | Time |
|-----------|-------|------|
| Full pipeline | 1 seed → 500 keywords | 2-3s |
| Expansion | 1 seed | 50ms |
| Normalization | 1,000 keywords | 30ms |
| Classification | 1,000 keywords | 100ms |
| CSV export | 1,000 rows | 20ms |

**Concurrency:** 4 concurrent jobs, 30s timeout

## 📁 Project Structure

```
seo-content-system/
├── backend/
│   ├── src/
│   │   ├── db/               # Database schema
│   │   ├── services/         # Core services (7 units)
│   │   ├── api/              # API routes
│   │   └── queue/            # p-queue configuration
│   └── tests/                # 250+ unit tests
├── frontend/
│   ├── src/
│   │   ├── pages/            # Dashboard, ProjectList
│   │   └── App.tsx           # React Router setup
│   └── package.json
└── README.md
```

## 🔧 Configuration

### Expansion Strategies
Edit `backend/src/config/expansion-strategies.json` to configure keyword expansion modifiers.

### Environment
Create `backend/.env`:
```bash
PORT=8000
NODE_ENV=development
```

## 🧪 Test Coverage

| Unit | Component | Tests |
|------|-----------|-------|
| 1.1 | Database Schema | —implicit— |
| 1.2 | Expansion Service | 13 |
| 1.3 | Normalization | 16 |
| 1.4 | Classification | 62 |
| 1.5 | Job Queue | 8 |
| 1.6 | Trend Service | 55+ |
| 1.7 | SERP Service | 60+ |
| 1.9 | Export Service | 35+ |

**Total: 250+ tests**

## 📝 Database Schema

**Core Tables:**
- `users` - User accounts
- `projects` - SEO projects
- `keyword_jobs` - Async keyword processing jobs
- `keyword_candidates` - Expanded keywords with lineage
- `keyword_features` - Classification dimensions & scores
- `serp_snapshots` - SERP analysis cache (Phase 2)

**Key Constraints:**
- `(job_id, normalized_keyword, depth)` UNIQUE prevents duplicates
- Checkpoint recovery for fault tolerance
- All deletes cascade

## 🐛 Troubleshooting

**Backend won't start:**
```bash
# Check if port 8000 is free
lsof -i :8000

# Reset database
rm backend/data.db
npm run db:init
```

**Jobs not processing:**
- Check `/api/queue/status` endpoint
- Verify job ID exists in database
- Check browser console for network errors

**Frontend can't connect:**
- Verify backend is running on port 8000
- Check CORS headers allow localhost:5173
- Check x-user-id header is sent

## 🔄 Data Flow Example

```
Input: Seed "python"
  ↓
[Expansion] → 1,000 candidates
  ↓
[Normalization] → 800 unique normalized keywords
  ↓
[Classification] → Assign intent, funnel, format
  ↓
[Trend] → stable, rising, seasonal (cached)
  ↓
[SERP] → competition score 0-100
  ↓
[Export] → CSV/JSON with stats
```

## 📚 Phase 2 Roadmap

- Real SERP scraping (Playwright)
- Google Trends integration
- Advanced clustering algorithms
- Content brief generation
- Multi-language support
- Cloud deployment (Docker + k8s)

## 📄 License

MIT

## 🙏 Contributing

This is a production-ready MVP. Fork and customize for your needs.

---

**Version:** 1.0.0 (Phase 1 MVP) → Phase 8 P6 (Webhooks Complete)
**Status:** Production Ready (Phase 8 P6 Webhook Filtering ✅)
**Last Updated:** 2026-04-15
