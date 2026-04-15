# TDK Optimizer — SEO Title/Description/Keywords Auto-Optimization

**A smart, rule-driven system for automatic TDK (Title/Description/Keywords) generation and validation.**

![Status](https://img.shields.io/badge/status-v0.3.0-green)
![Tests](https://img.shields.io/badge/tests-297%2B-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Overview

TDK Optimizer automates the creation of SEO-optimized page metadata (Title, Meta Description, Keywords) by combining:

- **AI Generation**: Claude API for intelligent candidate creation
- **Rule-Based Validation**: Automatic checking against SEO best practices
- **Phase 6 Integration**: Seamless integration with the SEO Content System

### The Problem

Content editors manually write Title/Description/Keywords, wasting time and introducing errors:
- ❌ Inconsistent with SEO standards
- ❌ Repetitive manual work (15 min per page)
- ❌ Multiple review cycles needed

### The Solution

TDK Optimizer generates optimal recommendations in seconds with automatic validation:
- ✅ Follows established SEO rules (length, stacking, consistency)
- ✅ Provides primary + 2-3 alternatives for choice
- ✅ Validates all candidates automatically
- ✅ Saves validated TDK directly to contentPlan

**Result**: 2-minute workflow vs 15 minutes, with better quality.

---

## Quick Start

### For Users

👉 **See [TDK_OPTIMIZER_GUIDE.md](./docs/TDK_OPTIMIZER_GUIDE.md) for step-by-step instructions.**

### For Developers

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Installation

```bash
# Clone and install
git clone <repo>
cd seo-tdk-2026
npm install

# Setup environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
```

#### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

#### Development

```bash
# Start backend dev server (includes auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run linter
npm run lint
```

**👉 [See DEPLOYMENT.md for full setup instructions](./DEPLOYMENT.md)**

---

## Features

### 🎯 Intelligent Generation (Phase 1-2)
- Generate primary recommendation + 2-3 alternatives
- Support English and Chinese content
- Use page content for consistency checking
- Claude API integration for natural language processing

### ✅ Comprehensive Validation (Phase 1-2)
- **Length checks**: Ensures title/description fit search results
- **Keyword stacking detection**: Catches repetition and density issues
- **Content consistency**: Verifies alignment with page topic
- **Multi-language support**: Different rules for English/Chinese

### 📊 Multi-Page Analysis (Phase 3)
- **Conflict detection**: Identify keyword overlaps across pages using Jaccard similarity
- **Topic coherence scoring**: Measure semantic consistency across content clusters
- **Conflict severity classification**: High/medium/low severity rankings
- **Batch summarization**: Analyze all TDK status across projects

### 💬 User Feedback System (Phase 3)
- Collect editor satisfaction feedback (rating + comment)
- Track feature attribution for transparency
- Analytics dashboard for feedback patterns
- Helps optimize future generation models

### 💾 Smart Storage (Phase 1-3)
- **Data separation**: AI recommendations + user edits stored separately
- **Immutable original**: Always keep original for regeneration
- **Validation cache**: Quick retrieval without re-validation
- **Generation history**: Full audit trail for accountability
- **User edit tracking**: Track which fields editors modified

### 🔐 Rate Limiting & Cost Tracking (Phase 3)
- **MVP rate limiting**: 100 requests/hour per user
- **Cost tracking**: Monitor token usage per endpoint
- **Usage summary**: View total tokens and remaining quota
- **In-memory storage**: Fast, lightweight tracking for personal use

### 💡 Global State Management (Phase 3)
- Zustand-powered state management for React
- Persistent TDK store with analysis results
- Real-time UI updates across components
- Type-safe store operations

### 🔧 Easy Integration
- REST API for any client
- Hono framework (lightweight, fast)
- Type-safe with TypeScript
- Drizzle ORM for database operations

### ⚙️ Highly Configurable
All rules are environment-variable driven:

```env
# Adjust title length standards
TITLE_LENGTH_OPTIMAL_MIN_EN=50
TITLE_LENGTH_OPTIMAL_MAX_EN=60

# Tune keyword stacking detection
STACKING_REPEAT_THRESHOLD=3
STACKING_DENSITY_FAIL=0.25

# Configure consistency checking
CONSISTENCY_COVERAGE_PASS=0.80
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend React                             │
│          (TdkOptimizer Component + Hook)                     │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API
┌────────────────────┴────────────────────────────────────────┐
│                   Backend (Hono)                             │
│                                                               │
│  ┌─ API Routes ─────────────────────────────────────────┐  │
│  │ POST /api/projects/{id}/tdk-optimize                 │  │
│  │ POST /api/projects/{id}/clusters/{id}/tdk-save       │  │
│  │ GET  /api/projects/{id}/clusters/{id}/tdk            │  │
│  └──────────────────────────────────────────────────────┘  │
│                     │                                         │
│  ┌─ Services ───────┴────────────────────────────────────┐  │
│  │ TdkGeneratorService (Claude API)                     │  │
│  │ TdkValidatorService (Rule application)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                     │                                         │
│  ┌─ Rules ──────────┴────────────────────────────────────┐  │
│  │ tdkRules.ts (Length, stacking, consistency checks)   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                   SQLite Database                            │
│  contentPlans (extended with tdkJson, userTdkJson, ...)    │
│  tdk_generation_history (audit trail)                       │
└─────────────────────────────────────────────────────────────┘
```

**See [TDK_OPTIMIZER_ARCHITECTURE.md](./docs/TDK_OPTIMIZER_ARCHITECTURE.md) for detailed design.**

---

## Documentation

| Document | Purpose |
|----------|---------|
| [TDK_OPTIMIZER_GUIDE.md](./docs/TDK_OPTIMIZER_GUIDE.md) | User guide for content editors and SEO specialists |
| [TDK_OPTIMIZER_ARCHITECTURE.md](./docs/TDK_OPTIMIZER_ARCHITECTURE.md) | Technical architecture and extension guide |
| [TDK_RULES.md](./docs/TDK_RULES.md) | Detailed validation rules and examples |

---

## API Reference

### Generate TDK

```bash
curl -X POST http://localhost:3000/api/projects/proj-1/clusters/cluster-1/tdk-optimize \
  -H "x-user-id: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Python programming tutorial",
    "keywords": ["Python", "tutorial", "beginners"],
    "contentSnippet": "Learn Python from scratch...",
    "language": "en"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "primary": {
      "candidate": {
        "title": "Python Programming Tutorial for Beginners",
        "description": "Learn Python from scratch...",
        "keywords": ["Python", "programming", "tutorial", "beginners"]
      },
      "validation": {
        "severity": "pass",
        "issues": []
      }
    },
    "alternatives": [...],
    "metadata": {...}
  }
}
```

### Save TDK

```bash
curl -X POST http://localhost:3000/api/projects/proj-1/clusters/cluster-1/tdk-save \
  -H "x-user-id: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "userTdkJson": {
      "title": "My Custom Title",
      "description": "My custom description",
      "keywords": ["custom", "keywords"]
    }
  }'
```

### Multi-Page Analysis - Conflict Detection

```bash
curl -X GET "http://localhost:3000/api/projects/proj-1/conflict-report?language=en" \
  -H "x-user-id: user-123"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "proj-1",
    "clustersAnalyzed": 5,
    "conflicts": {
      "total": 2,
      "highSeverity": 1,
      "mediumSeverity": 1,
      "lowSeverity": 0,
      "details": [
        {
          "cluster1Id": "cluster-1",
          "cluster2Id": "cluster-2",
          "overlapKeywords": ["python", "tutorial"],
          "jaccardSimilarity": 0.75,
          "severity": "high"
        }
      ]
    },
    "topicCoherence": {
      "avgSimilarity": 0.45,
      "redundancyScore": 0.45
    },
    "recommendation": "Detected 1 high-severity conflict. Consider consolidating or differentiating these pages."
  }
}
```

### Feedback Submission

```bash
curl -X POST http://localhost:3000/api/projects/proj-1/clusters/cluster-1/feedback \
  -H "x-user-id: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "Title was very helpful",
    "selectedCandidateIndex": 0
  }'
```

### Cost & Usage Summary

```bash
curl -X GET http://localhost:3000/api/cost-summary \
  -H "x-user-id: user-123"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "totalTokens": 45000,
    "requestCount": 23,
    "avgTokensPerRequest": 1956,
    "remainingRequests": 77,
    "requestsPerHour": 100
  }
}
```

---

## Testing

**297 tests** covering:
- ✅ Rules validation (50+ tests)
- ✅ Service layer (60+ tests)
- ✅ Multi-page analysis (35+ tests)
- ✅ Database operations (35+ tests)
- ✅ API routes (70+ tests)
- ✅ Feedback system (20+ tests)
- ✅ Cost tracking & middleware (15+ tests)
- ✅ Frontend components & hooks (10+ tests)
- ✅ End-to-end workflows (15+ tests)

```bash
# Run all tests
npm test

# Run specific suite
npm test -- tdkRules.test.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## Project Structure

```
seo-tdk-2026/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   └── tdk.ts           # API routes
│   │   ├── services/tdk/
│   │   │   ├── tdkRules.ts      # Rules engine
│   │   │   ├── tdkGeneratorService.ts
│   │   │   └── tdkValidatorService.ts
│   │   └── db/
│   │       ├── schema.ts         # Database schema
│   │       └── migrations/
│   │           └── 0001_add_tdk_fields.sql
│   └── tests/
│       ├── services/tdk/
│       ├── api/
│       ├── db/
│       └── integration/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── TdkOptimizer.tsx
│   │   │   └── TdkOptimizer.css
│   │   └── hooks/
│   │       └── useTdkOptimizer.ts
│   └── tests/
│       └── components/
│
├── docs/
│   ├── TDK_RULES.md
│   ├── TDK_OPTIMIZER_GUIDE.md
│   ├── TDK_OPTIMIZER_ARCHITECTURE.md
│   └── README.md
│
└── Configuration
    ├── package.json
    ├── tsconfig.json
    ├── jest.config.js
    └── .env.example
```

---

## Configuration

All validation rules are configurable via environment variables. See `.env.example` for all options.

**Key settings:**

```env
# API
ANTHROPIC_API_KEY=sk-...
TDK_GENERATION_TIMEOUT_MS=5000
TDK_CACHE_TTL_MINUTES=60

# Rules (see .env.example for complete list)
TITLE_LENGTH_OPTIMAL_EN=50-60
TITLE_LENGTH_OPTIMAL_ZH=25-30
STACKING_DENSITY_FAIL=0.25
CONSISTENCY_COVERAGE_PASS=0.80
```

---

## Performance

| Metric | Value |
|--------|-------|
| Generation latency | 2-3 seconds (Claude API) |
| Validation latency | <100ms (local rules) |
| API response time | <3.5 seconds (typical) |
| Database write | <50ms |
| Database read | <10ms (indexed queries) |

**Optimization opportunities** (roadmap):
- [ ] Cache generations by (topic, keywords) hash
- [ ] Parallel validation on alternatives
- [ ] Batch processing for multiple pages

---

## Contributing

### Adding a New Rule

1. Implement in `tdkRules.ts`
2. Add tests
3. Update documentation
4. Create PR with description

### Supporting a New Language

1. Add stopwords and rules to `tdkRules.ts`
2. Update Claude Prompt for language-specific guidance
3. Add tests with sample content
4. Update user guide

---

## Roadmap

### v0.2 (Q2 2026)
- [ ] Batch processing (CSV upload)
- [ ] Performance dashboard
- [ ] Multi-language support expansion

### v0.3 (Q3 2026)
- [ ] Competitor SERP analysis
- [ ] Real-time keyword trends
- [ ] Advanced content consistency (TF-IDF)

### v1.0 (Q4 2026)
- [ ] Mobile app
- [ ] API webhook subscriptions
- [ ] Advanced analytics and reporting

---

## License

MIT © 2026 SEO Content System

---

## Support

- 📖 **Docs**: See TDK_OPTIMIZER_GUIDE.md
- 🐛 **Issues**: [GitHub Issues](https://github.com)
- 💬 **Discussion**: [Slack Channel](#)
- 📧 **Contact**: tdk-optimizer@company.com

---

**Made with ❤️ for content editors and SEO specialists.**

Last updated: 2026-04-15
