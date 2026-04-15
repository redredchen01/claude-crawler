---
title: Dual-Site Resource Auto-Tagging System v1 MVP
type: feat
status: active
date: 2026-04-13
---

# Dual-Site Resource Auto-Tagging System v1 MVP

## Overview

Build a production-oriented MVP system for automatically tagging media resources across two similar content websites. The system ingests images and videos, extracts structured features using local tools (OCR, keyframe extraction), applies rule-based tagging, supports manual review workflows, and allows per-site display configuration while maintaining one shared tag system.

**Core principle:** Features are the fact layer; tags are the business logic derived from features. All auto-generated tags must be traceable to their source (features, rules, or manual).

## Problem Frame

Content teams managing two websites need:
- Consistent tagging across sites with shared tag definitions
- Automated feature extraction (visual properties, text, scenes) for initial processing
- Explainable, rule-based tag inference (not opaque ML)
- Manual review and correction workflows
- Per-site customization of tag display (slug, display name, visibility)
- Audit trails for all tag changes and reviews

Current state: Manual tagging is slow; ML-only approaches are not auditable.

## Requirements Trace

- R1. Shared tag system usable by both sites with per-site display customization
- R2. Resource ingestion endpoint supporting images and videos
- R3. Image feature extraction: dimensions, mime type, OCR text, readability signals
- R4. Video feature extraction: dimensions, duration, fps, 3-5 keyframes, OCR on keyframes
- R5. Rule-based tag inference from features with auditable source tracking
- R6. Conflict resolution (manual tags override auto, higher priority rules override lower)
- R7. Review workflow with approval, rejection, correction, and manual tag addition
- R8. Audit logs for all tag operations with before/after state
- R9. Admin UI for resource management, tag review, rule configuration, and site tag config
- R10. Idempotent operations (re-running extraction or tagging does not create duplicates)
- R11. Local dev setup with Docker Compose (PostgreSQL, Redis, backend, admin UI)
- R12. Seed data with example tags, rules, and site configurations

## Scope Boundaries

**In scope:**
- Image and video feature extraction using local tools (Tesseract, OpenCV, FFmpeg)
- Rule engine with condition evaluation (eq, neq, contains, in, gte, lte, exists)
- Manual review and tag correction workflows
- Per-site tag configuration and display customization
- Audit logging for compliance and debugging

**Out of scope for v1:**
- Real ML model integration (interfaces only; swap later)
- ASR (audio transcription)
- Recommendation engine
- Advanced semantic ranking or graph relationships
- Microservice sprawl (monolith is OK)
- High-throughput batch processing (start with simple queues)
- Multi-user concurrent review sessions (sequential OK for MVP)

## Context & Research

### Relevant Code and Patterns

**FastAPI project reference:** `/Users/dex/YD 2026/projects/production/video-watermark-removal-system/`
- Pydantic schema patterns (`JobCreate`, `JobResponse`)
- Settings/config management (`BaseSettings`)
- Async database operations (aiosqlite example; will use SQLAlchemy + PostgreSQL instead)
- API route organization and dependency injection (`Depends()`)
- File upload and processing patterns

**Resource template:** `/Users/dex/YD 2026/templates/resource.md`
- Metadata fields to consider for resource modeling

**Conventions:** `/Users/dex/YD 2026/CONVENTIONS.md`
- Naming and organizational standards

### Institutional Learnings

- Use dependency injection for testability (follow VWRS pattern)
- Async/await for I/O-heavy operations (extraction, database)
- Centralized config via environment variables
- Pydantic for request/response validation
- Structured logging for observability

### External References

- **FastAPI:** https://fastapi.tiangolo.com/ (Depends, background tasks, OpenAPI)
- **SQLAlchemy 2.0:** https://docs.sqlalchemy.org/en/20/ (ORM, async session, relationships)
- **Alembic:** https://alembic.sqlalchemy.org/ (database migrations)
- **Tesseract OCR:** https://github.com/UB-Mannheim/tesseract (Python bindings)
- **OpenCV:** https://docs.opencv.org/ (image processing, feature extraction)
- **FFmpeg:** https://ffmpeg.org/documentation.html (video frame extraction)
- **Celery/RQ:** Task queue pattern (will use RQ for simplicity in v1)

## Key Technical Decisions

1. **Features-first architecture:** Store extracted features in `resource_features` before inferring tags. This preserves provenance and allows tag rules to be updated without re-extracting.
   - *Rationale:* Explainability and auditability. Tags are derived; features are facts.

2. **Local extraction tools only (v1):** Use Tesseract (OCR), OpenCV (image), FFmpeg (video). No external ML APIs.
   - *Rationale:* Control, offline operation, cost, and compliance.

3. **Rule engine as data-driven configuration:** Rules live in `tag_rules` table with condition_json. Evaluation is generic.
   - *Rationale:* Non-engineers can add rules; rules are versionable and auditable.

4. **PostgreSQL + SQLAlchemy:** Match the team's existing infra; SQLAlchemy provides async support and migration tooling (Alembic).
   - *Rationale:* Consistency, strong ACID guarantees for audit logs.

5. **Redis for caching and simple queue:** Redis for feature cache, tag inference cache, and RQ job queue.
   - *Rationale:* Simple, familiar, suitable for MVP scale.

6. **Admin UI in React (minimal):** Internal-only UI, not a public product. Focus on operator workflow, not pixel perfection.
   - *Rationale:* Speed; team likely has React experience (see VWRS context).

7. **Single-site ingestion flow, dual-site config:** Resources are site-scoped; tags are shared. Per-site config determines display.
   - *Rationale:* Simplicity. Avoids duplicate processing and tag divergence.

8. **Idempotency via content hash:** File hash (for local files) or URL + size (for remote) deduplicates resources. Re-running extraction checks if features already exist.
   - *Rationale:* Safe retry semantics; tooling resilience.

9. **No ASR, 3-5 keyframes for video:** OCR on keyframes only. Keyframe selection is simple (uniform sampling or scene detection if time permits).
   - *Rationale:* Scope control; good-enough for MVP.

10. **Conflict resolution via priority and source:** Manual tags and approved review tags are pinned. Auto rules of higher priority override lower priority auto results.
    - *Rationale:* Clear, traceable, honors review authority.

## Open Questions

### Resolved During Planning

- **Which Python version?** Python 3.11+, per spec.
- **Database for dev?** PostgreSQL (not SQLite) to match production and enable proper async testing.
- **Admin UI framework?** React (Next.js optional for MVP; plain React is sufficient).

### Deferred to Implementation

- **Keyframe selection algorithm:** Simple uniform sampling for now; TBD during Phase 4.
- **OCR text preprocessing:** Detect and store language; clean whitespace. Details during Phase 4.
- **Cache invalidation policy:** When does feature cache expire? Decide during Phase 5 based on feature edit frequency.
- **Per-rule test harness:** Phase 5 mentions POST `/rules/{rule_id}/test`. Details depend on condition complexity.
- **Pagination strategy:** Cursor-based or offset? Decide when Phase 9 admin UI is detailed.

## High-Level Technical Design

```
┌────────────────────────────────────────────────────────────────────┐
│                    Resource Auto-Tagging System v1                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Ingestion (Phase 3)          Feature Extraction (Phase 4)        │
│  ┌──────────────────┐         ┌──────────────────────┐           │
│  │ POST /resources  │────────→│ Image: Tesseract,    │           │
│  │ (site_id, file)  │         │  OpenCV, dims        │           │
│  │                  │         │ Video: FFmpeg,       │           │
│  │ Deduplicate      │         │  keyframes (3-5),    │           │
│  │ by file_hash     │         │  OCR on keyframes    │           │
│  └──────────────────┘         └─────────┬────────────┘           │
│                                         │                         │
│                                    Write to                        │
│                              resource_features                    │
│                                         │                         │
│  Rule Engine (Phase 5)                  ↓                         │
│  ┌────────────────────────────────┐     │                        │
│  │ Load rules from tag_rules      │←────┤                        │
│  │ Condition: {all/any} + ops     │     │                        │
│  │ Evaluate against features      │     │                        │
│  │ → infer tags (resource_tags)   │────→│                        │
│  │ source=auto_rule, confidence   │     │                        │
│  └────────────────────────────────┘     ↓                        │
│                                                                    │
│  Review Workflow (Phase 7)              Audit Log (Phase 7)       │
│  ┌──────────────────┐                  ┌────────────────────┐   │
│  │ GET /reviews/q   │                  │ review_logs table  │   │
│  │ Approve/Reject   │                  │ {action, before,   │   │
│  │ Correct/Manual   │──────────────────→ after, reviewer_id}│   │
│  │ POST /reviews/   │                  │                    │   │
│  │ {action}         │                  └────────────────────┘   │
│  └──────────────────┘                                            │
│         │                                                         │
│         ├──→ Manual tag: write to resource_tags                 │
│         ├──→ Approve: set review_status=approved                │
│         ├──→ Reject: set review_status=rejected                 │
│         └──→ Correct: update tag_id, track in review_logs       │
│                                                                    │
│  Site Config (Phase 8)                 Admin UI (Phase 9)        │
│  ┌──────────────────┐                  ┌────────────────────┐   │
│  │ site_tag_config  │                  │ Resource list      │   │
│  │ per-site:        │                  │ Resource detail    │   │
│  │  - display_name  │──────────────────→ Feature viewer     │   │
│  │  - slug          │                  │ Tag review queue   │   │
│  │  - visibility    │                  │ Rule config page   │   │
│  │  - index flag    │                  │ Site tag config    │   │
│  └──────────────────┘                  └────────────────────┘   │
│                                                                    │
│  Shared Invariants:                                              │
│  • One tag_id, multiple aliases per site (tag_aliases)           │
│  • Manual tags override auto (review_status tracking)            │
│  • All changes logged (review_logs with before/after state)      │
│  • Idempotent: hash-based dedup, feature existence check         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

*This illustrates the intended data flow and component interactions. Implementation agents should treat it as directional guidance, not code specification.*

## Implementation Units

### **Phase 1: Project Setup and Structure**

- [ ] **Unit 1.1: Backend scaffold**

**Goal:** Create a runnable FastAPI backend with proper structure, config, and health check.

**Requirements:** R11

**Dependencies:** None

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py` (FastAPI app, lifespan hooks, middleware)
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py` (Settings with BaseSettings)
- Create: `backend/app/core/logging.py` (structured logging setup)
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/session.py` (SQLAlchemy async session factory)
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/health.py` (health check route)
- Create: `backend/app/models/__init__.py` (will be populated in Phase 2)
- Create: `backend/app/schemas/__init__.py` (will be populated in Phase 2)
- Create: `backend/app/services/__init__.py` (will be populated in Phase 3+)
- Create: `backend/app/workers/__init__.py` (will be populated in Phase 4+)
- Create: `backend/app/utils/__init__.py` (common utilities)
- Create: `backend/app/seed/__init__.py` (data seeding, will be used in Phase 10)
- Create: `backend/requirements.txt` (fastapi, sqlalchemy, alembic, pydantic-settings, aiosqlite for testing, etc.)
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py` (pytest fixtures for DB, client)
- Test: `backend/tests/test_health.py`

**Approach:**
- Use existing VWRS project as structural reference
- FastAPI with lifespan context for startup/shutdown hooks
- Pydantic Settings for config management (DATABASE_URL, REDIS_URL, etc. from .env)
- Async session management with SQLAlchemy
- Structured logging with JSON output (optional, but helpful)
- Health check route returns `{"status": "ok"}`

**Patterns to follow:**
- `/Users/dex/YD 2026/projects/production/video-watermark-removal-system/api/config.py` (Settings pattern)
- `/Users/dex/YD 2026/projects/production/video-watermark-removal-system/api/routes/` (route organization)

**Test scenarios:**
- Happy path: `GET /health` returns status 200 with `{"status": "ok"}`
- DB connection: Health check verifies postgres connection (will be wired in Phase 2)
- Config: .env.example is complete and loadable

**Verification:**
- Backend starts without errors: `uvicorn app.main:app --reload` runs
- `curl http://localhost:8000/health` returns valid JSON

---

- [ ] **Unit 1.2: Frontend admin scaffold**

**Goal:** Create a minimal React app with routing and component structure.

**Requirements:** R11

**Dependencies:** None

**Files:**
- Create: `admin/package.json` (react, react-router-dom, axios, typescript)
- Create: `admin/public/index.html`
- Create: `admin/src/index.tsx`
- Create: `admin/src/App.tsx` (routing setup)
- Create: `admin/src/pages/ResourceList.tsx` (placeholder)
- Create: `admin/src/pages/ResourceDetail.tsx` (placeholder)
- Create: `admin/src/pages/ReviewQueue.tsx` (placeholder)
- Create: `admin/src/pages/RuleConfig.tsx` (placeholder)
- Create: `admin/src/pages/SiteTagConfig.tsx` (placeholder)
- Create: `admin/src/lib/api.ts` (axios setup, base URL from env)
- Create: `admin/src/components/Navigation.tsx` (nav between pages)
- Create: `admin/.env.example` (REACT_APP_API_URL=http://localhost:8000)
- Create: `admin/Dockerfile`
- Create: `admin/tsconfig.json`

**Approach:**
- React Router for page navigation
- Minimal styling (utility CSS or Tailwind is OK, but keep it simple)
- axios client pointing to backend at REACT_APP_API_URL
- Each page as a stub that says "Coming in Phase 9"

**Patterns to follow:**
- Standard React project layout (pages, components, lib)
- TypeScript for type safety

**Test scenarios:**
- Happy path: App renders with nav menu showing all page links
- Navigation: Clicking each link loads the corresponding page (stub content OK)
- Config: .env.example is loadable and API_URL is used by axios client

**Verification:**
- Frontend starts: `npm start` runs without errors
- Browser at `http://localhost:3000` shows nav and stub pages

---

- [ ] **Unit 1.3: Docker Compose and local dev setup**

**Goal:** Wire backend, frontend, PostgreSQL, Redis, and a simple worker into a runnable local stack.

**Requirements:** R11

**Dependencies:** Units 1.1, 1.2

**Files:**
- Create: `docker-compose.yml` (services: postgres, redis, backend, admin, optionally worker)
- Create: `.env.example` (DATABASE_URL, REDIS_URL, API_HOST, API_PORT, etc.)
- Create: `README.md` (setup, running, stopping, and troubleshooting)
- Create: `Makefile` (optional, helpful shortcuts: make up, make down, make logs, etc.)

**Approach:**
- postgres:15 (or latest stable) with POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD from .env
- redis:7 (or latest stable)
- Backend service depends on postgres and redis, runs `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- Frontend service on port 3000
- Health checks for postgres and redis in backend service
- Volumes for database persistence and source code mounting

**Test scenarios:**
- Happy path: `docker-compose up` starts all services
- Backend health: After ~3s, `curl http://localhost:8000/health` succeeds
- Frontend loads: `http://localhost:3000` responds
- Postgres ready: Backend connects and can execute a simple query (health check)
- Redis ready: Backend can ping redis
- Code reload: Modifying a .py file auto-reloads uvicorn

**Verification:**
- All services are running: `docker-compose ps` shows all up
- No errors in logs: `docker-compose logs backend` shows clean startup

---

### **Phase 2: Database Schema and Migrations**

- [ ] **Unit 2.1: SQLAlchemy models for core tables**

**Goal:** Define ORM models for tags, tag_aliases, resources, resource_features, resource_tags, site_tag_config, tag_rules, review_logs.

**Requirements:** R1, R2, R3-R5, R7, R8, R10

**Dependencies:** Unit 1.1

**Files:**
- Create: `backend/app/models/__init__.py` (export all models)
- Create: `backend/app/models/tag.py` (Tag, TagAlias)
- Create: `backend/app/models/resource.py` (Resource, ResourceFeature)
- Create: `backend/app/models/tag_assignment.py` (ResourceTag)
- Create: `backend/app/models/site_config.py` (SiteTagConfig)
- Create: `backend/app/models/rule.py` (TagRule)
- Create: `backend/app/models/audit.py` (ReviewLog)
- Test: `backend/tests/test_models.py` (model instantiation and relationships)

**Approach:**
- Use SQLAlchemy 2.0 ORM (declarative base)
- Proper foreign key relationships (cascade rules for safety)
- Enums for status fields (JobStatus, ReviewAction, ReviewStatus, etc.)
- JSON columns for `condition_json` (TagRule) and `raw_payload` (ResourceFeature)
- Indexes on frequently-queried fields (site_id, status, created_at, file_hash, resource_id)
- created_at/updated_at timestamps with server defaults

**Patterns to follow:**
- Use `Column(DateTime, server_default=func.now())` for timestamps
- Define relationships bidirectionally where helpful (e.g., Resource → ResourceFeatures)
- Use Enum types (e.g., `Enum(ReviewStatus)`) for constrained strings

**Test scenarios:**
- Model creation: Instantiate each model with valid data
- Relationships: Create a Resource, add Features, add Tags; verify foreign keys
- Enums: Status values are correctly constrained
- Timestamps: created_at defaults to now

**Verification:**
- Models import cleanly: `from app.models import Tag, Resource, ResourceFeature, ...`
- No SQLAlchemy errors on table definition

---

- [ ] **Unit 2.2: Alembic migration setup and initial migration**

**Goal:** Create Alembic scaffolding and an initial migration that creates all Phase 2 tables from scratch.

**Requirements:** R11, R10 (schema version control)

**Dependencies:** Unit 2.1

**Files:**
- Create: `backend/alembic/` (standard Alembic structure)
- Create: `backend/alembic/env.py` (configure DB URL from settings)
- Create: `backend/alembic/script.py.mako` (migration template)
- Create: `backend/alembic/versions/0001_initial_schema.py` (CreateTable statements for all models)
- Create: `backend/alembic.ini`
- Modify: `backend/app/db/session.py` (add migration utilities if needed)

**Approach:**
- Generate Alembic scaffold: `alembic init alembic`
- Configure `alembic/env.py` to read DATABASE_URL from settings
- Auto-generate initial migration: `alembic revision --autogenerate -m "Initial schema"`
- Review and validate migration (order of table creates, FKs, indexes)
- Migration should be idempotent (can run multiple times safely)

**Test scenarios:**
- Migration runs cleanly: `alembic upgrade head` on fresh database
- Tables are created: `\dt` in psql shows all tables
- Indexes exist: `\d+ <table>` shows indexes
- ForeignKeys are set: `\d+ resource_tags` shows FK to resources and tags

**Verification:**
- Fresh database can be initialized: `docker-compose up`, then `alembic upgrade head` succeeds
- `psql -U <user> -d <db> -c "select * from information_schema.tables where table_schema='public';"` shows all tables

---

### **Phase 3: Resource Ingestion**

- [ ] **Unit 3.1: Resource ingestion endpoint and service**

**Goal:** Implement `POST /resources` to ingest images and videos, compute file hash, store resource record, and enqueue extraction jobs.

**Requirements:** R2, R10 (idempotency via hash)

**Dependencies:** Unit 1.1, 2.1, 2.2

**Files:**
- Create: `backend/app/schemas/resource.py` (ResourceCreate, ResourceResponse, ResourceListResponse)
- Create: `backend/app/services/resource_service.py` (create_resource, get_resource, list_resources, deduplicate_by_hash)
- Create: `backend/app/api/resources.py` (POST, GET, GET /{id} routes)
- Create: `backend/app/utils/file_utils.py` (compute_file_hash, store_temp_file)
- Modify: `backend/app/main.py` (include resources router)
- Test: `backend/tests/test_resources.py` (ingestion, deduplication, listing)

**Approach:**
- POST /resources accepts:
  - site_id (int, required)
  - resource_type (enum: "image" or "video", required)
  - file (UploadFile, required) or source_url (str, optional)
  - title (str, optional)
  - description (str, optional)
  - content_id (str, optional, external reference)
- Compute SHA256 hash of file content
- Check if resource with same hash + site_id already exists (deduplication)
- If duplicate, return existing resource (idempotent)
- If new, store file to disk/S3, create Resource record, enqueue extraction job
- Return ResourceResponse with resource_id, status (pending), and file metadata
- Extraction jobs are enqueued to Redis queue (Phase 4 will define the worker)

**Patterns to follow:**
- Service layer pattern: business logic in `resource_service.py`, routes are thin
- Pydantic schemas for request/response validation
- Async file operations

**Test scenarios:**
- Happy path: POST with image file → Resource created with status=pending, hash computed
- Deduplication: POST same file again → Returns existing resource, no duplicate created
- Metadata: title and description stored correctly
- Video vs image: resource_type determines which extraction job is enqueued
- External URL fallback: If source_url provided instead of file, store URL and metadata

**Verification:**
- Resource record appears in database with correct hash and file_path
- Extraction job is enqueued (visible in Redis or queue logs)
- Duplicate POST returns same resource_id

---

### **Phase 4: Feature Extraction Pipeline**

- [ ] **Unit 4.1: Image feature extraction**

**Goal:** Extract image metadata, OCR text, and readability signals. Store results in resource_features table.

**Requirements:** R3, R10

**Dependencies:** Unit 3.1

**Files:**
- Create: `backend/app/services/extractors/__init__.py`
- Create: `backend/app/services/extractors/image_extractor.py` (ImageExtractor class)
- Create: `backend/app/services/extractors/base_extractor.py` (BaseExtractor interface)
- Create: `backend/app/workers/extraction_worker.py` (RQ job handler)
- Create: `backend/app/utils/ocr_utils.py` (Tesseract wrapper)
- Create: `backend/app/utils/image_utils.py` (OpenCV utilities for readability, quality heuristics)
- Modify: `backend/requirements.txt` (pytesseract, opencv-python, Pillow)
- Test: `backend/tests/test_image_extractor.py`

**Approach:**
- ImageExtractor reads image file, extracts:
  - width, height (via OpenCV or PIL)
  - mime_type
  - OCR text (Tesseract)
  - has_text (bool, if OCR result is non-empty)
  - quality_score (simple heuristic: contrast/sharpness estimation with OpenCV)
  - readability_score (OCR confidence average, if available)
- Store each feature in resource_features with:
  - feature_type (e.g., "image_metadata", "ocr_text", "quality")
  - feature_key (e.g., "width", "height", "ocr_result", "has_text", "quality_score")
  - feature_value (serialized)
  - confidence (1.0 for deterministic metadata, OCR confidence for text)
  - source_model ("tesseract", "opencv")
  - raw_payload (full Tesseract output or image stats JSON)
- RQ worker processes extraction jobs asynchronously
- Idempotency: Check if features already exist for resource before re-extracting

**Patterns to follow:**
- Extractor interface allows swapping Tesseract for other OCR later
- Feature storage is generic (key-value), not image-specific

**Test scenarios:**
- Happy path: Extract features from a test JPG → width, height, mime type, OCR text stored
- OCR empty: Blank/noise image → has_text=false, ocr_result=""
- OCR non-empty: Image with readable text → has_text=true, ocr_result contains text
- Idempotency: Extract same image twice → No duplicate features created
- Async job: POST resource, then check resource_features table shows features

**Verification:**
- Resource features appear in database for image resources
- feature_key values match the specification (width, height, has_text, etc.)
- feature_value is properly serialized

---

- [ ] **Unit 4.2: Video feature extraction**

**Goal:** Extract video metadata, keyframes (3-5 frames), and OCR on keyframes. Store results in resource_features.

**Requirements:** R4, R10

**Dependencies:** Unit 4.1

**Files:**
- Create: `backend/app/services/extractors/video_extractor.py` (VideoExtractor class)
- Create: `backend/app/utils/video_utils.py` (FFmpeg wrapper, keyframe extraction)
- Modify: `backend/requirements.txt` (ffmpeg-python or subprocess ffmpeg)
- Modify: `backend/app/workers/extraction_worker.py` (add video extraction job)
- Test: `backend/tests/test_video_extractor.py`

**Approach:**
- VideoExtractor reads video file, extracts:
  - width, height (via FFmpeg probe)
  - duration_sec (float)
  - fps (float)
  - mime_type
  - keyframes: Extract 3-5 frames (simple: uniform sampling at 25%, 50%, 75%, 100% of duration, or time-based interval)
  - For each keyframe: run OCR (reuse ImageExtractor or Tesseract)
  - has_text (bool, if any keyframe has OCR text)
  - subtitle_region_detected (optional, simple heuristic: if text appears at bottom ~20% of frame)
  - Store keyframe images to disk (with feature_id reference)
- Store in resource_features:
  - Video metadata: duration, fps, width, height
  - Keyframe references: keyframe_paths (JSON array of paths)
  - OCR aggregation: has_text, combined_ocr_text (from all keyframes)
  - Heuristics: subtitle_region (bool)
- Idempotency: Check if features exist before re-extracting

**Patterns to follow:**
- Reuse ImageExtractor or Tesseract wrapper for keyframe OCR
- Keyframe storage strategy: `resources/{resource_id}/keyframes/{frame_number}.jpg`
- Raw payload: FFmpeg probe JSON (for debugging/future use)

**Test scenarios:**
- Happy path: Extract features from test MP4 → width, height, fps, duration, keyframes stored
- Keyframes extracted: 3-5 keyframe images on disk
- OCR on keyframes: If keyframes contain text, has_text=true and ocr_text is populated
- Idempotency: Extract same video twice → No duplicate features or keyframes
- Async job: POST video resource, check features appear

**Verification:**
- Video features appear in database
- Keyframe files exist on disk
- feature_key includes "duration", "fps", "width", "height", "keyframes", "has_text"

---

### **Phase 5: Rule Engine**

- [ ] **Unit 5.1: Rule engine service and tag inference**

**Goal:** Load rules, evaluate conditions against features, infer tags, store in resource_tags with proper source and confidence tracking.

**Requirements:** R5, R10

**Dependencies:** Unit 2.1, 4.1, 4.2

**Files:**
- Create: `backend/app/services/rule_engine.py` (RuleEngine class, condition evaluation)
- Create: `backend/app/services/tag_service.py` (infer_tags_for_resource, store_resource_tags)
- Create: `backend/app/schemas/rule.py` (RuleCreate, RuleResponse, ConditionSchema)
- Create: `backend/app/api/rules.py` (GET, POST rules, POST /{id}/test)
- Modify: `backend/app/workers/extraction_worker.py` (after extraction, infer tags)
- Test: `backend/tests/test_rule_engine.py` (condition evaluation, tag inference)

**Approach:**
- Load all active rules from tag_rules table
- For each rule, evaluate its condition_json against resource_features
- Condition structure:
  ```json
  {
    "all": [
      { "feature_key": "has_text", "operator": "eq", "value": true },
      { "feature_key": "object_type", "operator": "contains", "value": "classroom" }
    ]
  }
  // or
  {
    "any": [
      { "feature_key": "has_text", "operator": "eq", "value": true }
    ]
  }
  ```
- Operators: eq, neq, contains, in, gte, lte, exists
- If condition matches, create ResourceTag with:
  - tag_id (from rule.tag_id)
  - source = "auto_rule"
  - confidence (from feature confidence or rule default)
  - status = "pending" (default)
  - review_status = "unreviewed" or "approved" (if rule.review_required=false, mark "approved")
- Store all inferred tags
- Idempotency: Check if tag already exists for this resource before creating duplicate

**Patterns to follow:**
- Condition evaluation is recursive (supports nested all/any)
- Feature lookup by key is flexible (feature may not exist; operator "exists" checks this)
- Store confidence as the minimum of feature confidence and rule confidence

**Test scenarios:**
- Happy path: Rule with simple condition (has_text=true) matches → Tag created with source=auto_rule
- No match: Rule condition does not match → No tag created
- Nested conditions: "all" and "any" operators work correctly
- Idempotency: Infer tags twice → No duplicates
- Confidence: Tag confidence is min(feature.confidence, rule.confidence)
- Review required: If rule.review_required=true, tag.review_status=unreviewed

**Verification:**
- ResourceTags appear in database after extraction completes
- source="auto_rule" for all auto-inferred tags
- No duplicate tags for same resource+tag_id combination

---

### **Phase 6: Conflict Resolution**

- [ ] **Unit 6.1: Tag conflict detection and resolution**

**Goal:** Implement conflict resolution rules: manual tags override auto, higher-priority rules override lower-priority.

**Requirements:** R6, R8 (conflict logic traceable in audit logs)

**Dependencies:** Unit 5.1

**Files:**
- Create: `backend/app/services/conflict_resolver.py` (ConflictResolver class)
- Modify: `backend/app/services/tag_service.py` (add conflict resolution before storing tags)
- Create: `backend/app/models/conflict.py` (optional, if conflict tracking table is needed)
- Test: `backend/tests/test_conflict_resolver.py`

**Approach:**
- Define conflict rules in database or as static configuration (e.g., conflict_pairs = [("single_person", "multi_person"), ("indoor", "outdoor")])
- Before storing inferred tags:
  - Check if conflicting tag already exists for resource
  - If conflicting tag is manual or approved-reviewed → Skip inferring new tag (manual wins)
  - If conflicting tag is auto-rule with lower priority → Replace it (higher priority wins)
  - If no conflict → Store tag normally
- Log conflict detection in review_logs (or a dedicated conflict_log) for auditability
- Update resource_tags.status to "superseded" if replaced (preserve history)

**Patterns to follow:**
- Conflict rules are data-driven (conflict_pairs table or constant)
- Conflict resolution preserves history (mark superseded, not deleted)

**Test scenarios:**
- Happy path: Auto-infer "multi_person"; manual tag "single_person" exists → Auto tag not created
- Priority override: Auto-infer from rule (priority 5); auto-infer from rule (priority 3) exists → Replace lower-priority
- No conflict: Auto-infer "classroom"; no conflicting tag → Store normally
- Manual wins: Manual tag exists → Cannot be overridden by any auto tag

**Verification:**
- Conflicting tags are not created in resource_tags
- Superseded tags are marked with status="superseded"
- Conflict log entries exist in review_logs

---

### **Phase 7: Review Workflow**

- [ ] **Unit 7.1: Review queue and approval actions**

**Goal:** Implement endpoints for reviewing, approving, rejecting, and correcting tags. Log all actions to review_logs.

**Requirements:** R7, R8

**Dependencies:** Unit 2.1, 5.1, 6.1

**Files:**
- Create: `backend/app/schemas/review.py` (ReviewQueueItem, ApproveRequest, RejectRequest, CorrectRequest, ManualTagRequest)
- Create: `backend/app/services/review_service.py` (approve_tag, reject_tag, correct_tag, add_manual_tag, remove_tag, get_review_queue)
- Create: `backend/app/api/reviews.py` (GET /queue, POST /{resource_tag_id}/approve, etc.)
- Modify: `backend/app/models/audit.py` (ReviewLog model)
- Test: `backend/tests/test_review_service.py`

**Approach:**
- GET `/reviews/queue` returns paginated list of unreviewed tags filtered by:
  - site_id (optional)
  - resource_type (optional)
  - source (auto_rule, manual, etc.)
  - review_status (unreviewed, pending_decision, etc.)
  - tag_type (optional)
  - confidence_lte (optional, low confidence tags)
  - Sorting: by resource_id, tag_id, confidence ascending
- Actions:
  - POST `/reviews/{resource_tag_id}/approve` → Set review_status="approved", create ReviewLog
  - POST `/reviews/{resource_tag_id}/reject` → Set review_status="rejected", do not remove tag (preserve history)
  - POST `/reviews/{resource_tag_id}/correct` → Update tag_id to new_tag_id, log before/after state
  - POST `/reviews/manual-tag` → Create new ResourceTag with source="manual", review_status="approved" (manual tags are auto-approved)
  - POST `/reviews/{resource_tag_id}/remove` → Mark status="removed", log action
- ReviewLog structure:
  - resource_tag_id, resource_id, tag_id
  - reviewer_id (from auth context or session)
  - action (approve, reject, correct, add_manual, remove)
  - before_state (JSON: previous tag data)
  - after_state (JSON: new tag data)
  - note (optional user comment)
  - created_at
- Idempotency: Approving an already-approved tag is a no-op (check status first)

**Patterns to follow:**
- Service layer handles business logic; routes are thin
- ReviewLog entries preserve full state for auditing

**Test scenarios:**
- Happy path: GET /reviews/queue returns unreviewed tags
- Approve: POST approve → review_status changes, ReviewLog created
- Reject: POST reject → tag not deleted, status marked rejected
- Correct: POST correct with new_tag_id → tag_id updated, before/after logged
- Manual tag: POST manual-tag → New ResourceTag with source="manual", status="approved"
- Filter queue: GET /queue?resource_type=image → Returns only image resources
- Idempotency: Approve same tag twice → Second approve is no-op

**Verification:**
- ReviewLog entries exist for all actions
- before_state and after_state are valid JSON
- Tag statuses are updated correctly
- reviewer_id is captured (use placeholder user "admin" for now)

---

### **Phase 8: Site Tag Configuration**

- [ ] **Unit 8.1: Per-site tag configuration**

**Goal:** Allow per-site customization of tag display (display_name, slug, visibility) while maintaining shared tag_id.

**Requirements:** R1, R8 (config changes may be logged)

**Dependencies:** Unit 2.1

**Files:**
- Create: `backend/app/schemas/site_config.py` (SiteTagConfigResponse, SiteTagConfigUpdate)
- Create: `backend/app/services/site_config_service.py` (get_site_tags, update_tag_config)
- Create: `backend/app/api/sites.py` (GET /sites/{site_id}/tags, PUT /sites/{site_id}/tags/{tag_id})
- Test: `backend/tests/test_site_config.py`

**Approach:**
- GET `/sites/{site_id}/tags` returns all tags with site-specific config:
  - canonical_name (from tags table)
  - tag_type, description (from tags table)
  - site-specific: display_name, slug, is_enabled, is_visible, is_indexed, sort_order, seo_title_template, seo_desc_template
  - Paginated or all (small MVP, all is OK)
- PUT `/sites/{site_id}/tags/{tag_id}` updates site-specific config (display_name, slug, is_enabled, is_visible, is_indexed, sort_order, SEO templates)
- Both sites can customize the same tag_id independently
- Tag aliases are per-site (optional: allow per-site language variants)

**Patterns to follow:**
- Service layer queries both tags and site_tag_config tables, merges result
- Updates only affect site_tag_config, never the shared tags table

**Test scenarios:**
- Happy path: GET /sites/1/tags → All tags with site 1's config
- Update: PUT /sites/1/tags/1 with display_name="Custom Name" → Config updated
- Multi-site: Same tag_id has different display_name on site 1 vs site 2
- Visibility: Tag with is_visible=false does not appear in frontend

**Verification:**
- site_tag_config records are created/updated correctly
- GET returns merged data (tag + site config)

---

### **Phase 9: Admin UI**

- [ ] **Unit 9.1: Admin UI pages and components**

**Goal:** Build minimal, operator-focused admin UI for resource management and tag review.

**Requirements:** R9, R11 (local dev includes working admin UI)

**Dependencies:** Unit 1.2, 3.1, 5.1, 7.1, 8.1

**Files:**
- Modify: `admin/src/pages/ResourceList.tsx` (list resources with pagination, filter by site/status)
- Modify: `admin/src/pages/ResourceDetail.tsx` (show resource, metadata, features, current tags, tag history)
- Modify: `admin/src/pages/ReviewQueue.tsx` (unreviewed tags, approve/reject/correct actions)
- Modify: `admin/src/pages/RuleConfig.tsx` (list, create, edit, test rules)
- Modify: `admin/src/pages/SiteTagConfig.tsx` (per-site tag display customization)
- Create: `admin/src/components/TagViewer.tsx` (display tag with source, confidence, status)
- Create: `admin/src/components/FeatureViewer.tsx` (display extracted features with preview)
- Create: `admin/src/lib/types.ts` (TypeScript types for API responses)
- Modify: `admin/src/lib/api.ts` (add API calls for all endpoints)

**Approach:**
- **ResourceList:** Table of resources, columns: ID, Site, Type, Title, Status, Created. Filter by site, resource_type, status. Link to ResourceDetail.
- **ResourceDetail:** Show:
  - Resource metadata (title, description, file path, hash)
  - Media preview (img tag for images, video placeholder for videos)
  - Extracted features (table: feature_type, key, value, confidence, source)
  - Current tags (table: tag name, source, confidence, review_status, actions: approve/reject/correct/remove)
  - Tag history (review logs for this resource)
  - Add manual tag (dropdown of all tags, submit button)
- **ReviewQueue:** Table of unreviewed tags, columns: Resource ID, Tag, Source, Confidence, ReviewStatus. Actions: Approve, Reject, Correct (modal to select new tag), Remove. Filter by site, resource_type, source, confidence_lte.
- **RuleConfig:** Table of rules, columns: ID, Name, Tag, Priority, Active. Actions: View condition, Edit, Test (POST /rules/{id}/test, show result). Create button opens form to add rule.
- **SiteTagConfig:** Per-site tag display. Select site, table of tags with: canonical_name, display_name (editable), slug (editable), is_visible (toggle), is_enabled (toggle). Save button updates all changes.
- Styling: Minimal CSS, utility classes OK. Focus on usability, not aesthetics.

**Patterns to follow:**
- React hooks (useState, useEffect, useContext) for state management (no Redux for MVP)
- Fetch data on component mount with useEffect
- Error handling: catch and display errors to user
- Loading state: show spinner while fetching

**Test scenarios:**
- Happy path: ResourceList loads and shows resources
- ResourceDetail: Click resource, see metadata and features
- ReviewQueue: Unreviewed tags display, approve action works
- Correct action: Modal opens, user selects new tag, tag is updated
- RuleConfig: Rules display, can view/edit rules
- SiteTagConfig: Tags display with site config, editable fields update on save

**Verification:**
- All pages load without errors
- API calls succeed (mocked if API not ready)
- Actions (approve, correct, save config) submit to backend

---

### **Phase 10: Seed Data**

- [ ] **Unit 10.1: Seed tags, rules, and site configuration**

**Goal:** Populate the database with example tags, rules, site config, and tag aliases for both sites.

**Requirements:** R12

**Dependencies:** Unit 2.2, 8.1

**Files:**
- Create: `backend/app/seed/seed_data.py` (seed function)
- Create: `backend/app/seed/tags.json` (example tags: object_type, visual_attribute, scene, risk)
- Create: `backend/app/seed/rules.json` (example rules matching Phase 10 spec)
- Create: `backend/app/seed/site_config.json` (per-site display config for both sites)
- Create: `backend/scripts/seed.py` (runner script)

**Approach:**
- Define seed data as JSON files for clarity and portability
- Load and insert via seed_data.py (idempotent: check if tags exist first)
- Tags to seed:
  - object_type: image, video, document, other
  - visual_attribute: single_person, multi_person, has_text, has_watermark, has_subtitle
  - scene: classroom, office, outdoor, etc.
  - risk: needs_review, unsafe, etc.
- Rules to seed (per Phase 10 spec):
  1. resource_type=image → object_type:image
  2. person_count=1 → visual_attribute:single_person
  3. person_count>=2 → visual_attribute:multi_person
  4. has_text=true → visual_attribute:has_text
  5. has_watermark=true → visual_attribute:has_watermark
  6. has_subtitle=true → visual_attribute:has_subtitle
  7. scene=classroom → scene:classroom
  8. nsfw_score>=0.7 → risk:needs_review
- Site config: For both sites, set display_name, slug, is_visible, is_enabled for each tag
- Tag aliases: Optional, add language variants (e.g., "单人" for Chinese site)

**Patterns to follow:**
- Seed data is idempotent (rerunning does not create duplicates)
- Use Alembic for schema, scripts/ for data

**Test scenarios:**
- Happy path: Run seed script, database is populated
- Idempotency: Run seed script twice, no duplicates
- Rules evaluate correctly: Create a resource with has_text=true, infer tags, tag with visual_attribute:has_text is created

**Verification:**
- Tags appear in database: `SELECT * FROM tags;`
- Rules appear: `SELECT * FROM tag_rules;`
- Site config appears: `SELECT * FROM site_tag_config WHERE site_id=1;`

---

### **Phase 11: Tests**

- [ ] **Unit 11.1: Integration and unit tests for critical paths**

**Goal:** Add meaningful test coverage for core functionality (ingestion, extraction, rule evaluation, review actions, conflict resolution).

**Requirements:** General quality

**Dependencies:** All previous units

**Files:**
- Modify: `backend/tests/conftest.py` (add fixtures for DB session, test client, sample resources, rules)
- Create: `backend/tests/test_ingestion_e2e.py` (end-to-end: upload image, extract features, infer tags)
- Create: `backend/tests/test_rule_evaluation.py` (rule engine: condition evaluation, tag inference)
- Create: `backend/tests/test_conflict_resolution.py` (conflict: manual vs auto, priority override)
- Create: `backend/tests/test_review_workflow.py` (review: approve, reject, correct, manual tag)
- Create: `backend/tests/test_site_config.py` (per-site config update and retrieval)
- Create: `backend/tests/integration_test.py` (full flow: ingest → extract → infer → review → display)

**Approach:**
- Use pytest with async support (pytest-asyncio)
- Fixtures: in-memory SQLite or test postgres instance, mock image/video files, test rules
- Happy path + error path for each critical flow
- Integration tests: full request/response cycle using test client
- Unit tests: service layer with mocked dependencies
- Test data: Use temporary files and mock Tesseract/FFmpeg if necessary for speed

**Patterns to follow:**
- Parametrized tests for multiple rule conditions
- Context managers for test setup/teardown (fixtures)
- Clear test names: `test_<function>_<scenario>`

**Test scenarios:**
- Ingestion: Upload image, verify resource created, hash computed
- Extraction: Image extraction creates features, video creates keyframes
- Rule evaluation: Multiple rules evaluated, correct tags inferred
- Conflict resolution: Manual tag prevents auto inference of conflicting tag
- Review workflow: Approve changes review_status, correct updates tag_id
- Site config: Different sites have different display names for same tag
- End-to-end: Upload → Extract → Infer → Review → Config → Display (happy path)

**Verification:**
- All tests pass: `pytest backend/tests/`
- Coverage report: Aim for >70% on critical modules (services, rule_engine)

---

### **Phase 12: Documentation**

- [ ] **Unit 12.1: Architecture, setup, and operational documentation**

**Goal:** Document how to run, extend, and operate the system.

**Requirements:** R11 (local dev setup), general understanding

**Dependencies:** All previous units

**Files:**
- Modify: `README.md` (architecture overview, local setup, stopping, troubleshooting)
- Create: `docs/ARCHITECTURE.md` (system design, data flow, component responsibilities)
- Create: `docs/API.md` (API reference, request/response examples for all endpoints)
- Create: `docs/EXTRACTION.md` (how image/video extraction works, feature types, confidence)
- Create: `docs/RULES.md` (how to write and test rules, condition syntax, examples)
- Create: `docs/REVIEW.md` (review workflow, approval actions, audit logs)
- Create: `docs/EXTENDING.md` (how to add a new tag, new rule, new feature type, new extractor)
- Create: `docs/KNOWN_LIMITS.md` (v1 limitations: no ASR, 3-5 keyframes, no ML models, etc.)

**Approach:**
- README: Quick start (docker-compose up), endpoints, next steps
- ARCHITECTURE: Component diagram (Mermaid or ASCII), data flow, database schema overview
- API: Endpoint list with curl examples, request/response payloads
- EXTRACTION: Feature extraction process for images/videos, feature types, confidence calculation
- RULES: Rule engine basics, condition JSON format, operators, examples
- REVIEW: How to approve/reject/correct tags, what audit logs track
- EXTENDING: Step-by-step guides for common tasks (add tag type, add rule, swap OCR engine)
- KNOWN_LIMITS: What is not in v1, rationale, future plans

**Patterns to follow:**
- Clear section headings, examples for every concept
- Code blocks for JSON, curl, Python
- Links between docs (docs as hyperlinked reference)

**Verification:**
- README is clear enough for a new developer to set up locally
- EXTENDING has working examples for adding a tag and a rule
- All endpoints are documented with examples

---

## System-Wide Impact

- **Interaction graph:** 
  - Resource ingestion triggers extraction jobs (RQ worker)
  - Extraction completion triggers rule engine (infer tags)
  - Tag inference may trigger conflict resolution (manual/priority override)
  - Review actions write to audit log and update tag status
  - Site config serves display metadata to frontend (no feedback loop to core system)

- **Error propagation:**
  - Extraction job fails: Resource status=error, manual review required (UI shows warning)
  - Rule evaluation fails: Log error, skip tag inference for that rule (continue with others)
  - Review action fails: Transactional (all-or-nothing), rollback if audit log fails

- **State lifecycle risks:**
  - Partial write (feature extraction): Atomic transaction, all-or-nothing. If Tesseract output saved but feature record fails, rollback.
  - Duplicate tags: Hash-based dedup + constraint (unique resource_id, tag_id)
  - Orphaned features: If resource deleted, cascade delete features and tags (preserve audit logs)
  - Cache invalidation: Feature cache (if added later) invalidated on resource deletion

- **API surface parity:**
  - Backend API is the source of truth; admin UI is a wrapper
  - Frontend must reflect backend state (no optimistic updates without verification)
  - Site-specific display: Both sites use same backend API, filtered/configured per site

- **Integration coverage:**
  - Feature extraction → Rule engine: Feature storage must complete before rule evaluation (sequential)
  - Rule engine → Conflict resolver: Conflict check before storing tags (atomic)
  - Review → Audit log: All review actions must write ReviewLog (enforced in transaction)

- **Unchanged invariants:**
  - Shared tag_id: Both sites reference same tag_id; customization only in site_tag_config (never in tags table)
  - Feature immutability: Features are facts; once extracted, they do not change (new extraction creates new records with updated_at timestamp, old records preserved)
  - Manual tag priority: Manual tags (source="manual", review_status="approved") can never be overridden by auto tags

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tesseract OCR accuracy varies by image quality | Confidence score stored; low-confidence results flagged for review. No tag inference from uncertain OCR. |
| Video extraction slow (FFmpeg); user perceives delay | Async extraction (RQ worker); Resource status=pending shown to user. Extraction time documented. |
| Feature extraction memory spike (large video) | Start with 3-5 keyframes (not full frame sequence). Monitor memory in Phase 4 tests. Implement streaming if needed in v2. |
| Conflicting tag definitions (e.g., both "classroom" and "office" applied) | Conflict resolution defined explicitly; conflicts logged for review. User can reject one during review. |
| Audit log growth (1000s of review actions) | Use database indexes; implement log rotation/archival if tables grow beyond 1M rows. |
| Extractor interface not used (hardcoded Tesseract) | Code review to enforce interface pattern. Phase 4 tests verify extractor is swappable (mock test with different extractor). |
| Admin UI performance (100s of resources) | Pagination (50 items/page) implemented from start. Indexes on site_id, status, created_at. |
| Site config not synced (Display name changed, not reflected in API) | GET /sites/{site_id}/tags always queries fresh from DB (no caching). Tests verify config changes are immediate. |

## Deferred to Implementation

- **Exact keyframe timing:** Frame indices or timestamps? Decide during Unit 4.2 based on video properties.
- **Cache invalidation:** If caching added in v1.1, when does feature cache expire?
- **Bulk operations:** Batch tagging multiple resources at once? Phase 12 mentions single-resource endpoints; consider for v2.
- **Export/import:** Download tags, rules, or audit logs as CSV? Phase 12 documents current state; consider for v2.
- **Notification/Alerting:** Alert reviewer when new resources ready? Not in v1; consider for v2.

## Implementation Sequencing

**Strict order:** Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

**Rationale:**
- Phases 1-2: Foundation (app structure, database)
- Phase 3: Ingest resources (no point in extracting without ingestion)
- Phase 4: Extract features (needed for rule engine)
- Phase 5: Infer tags (needs features; core business logic)
- Phase 6: Resolve conflicts (applied after inference)
- Phase 7: Review workflow (core user interaction)
- Phase 8: Site config (display/presentation layer)
- Phase 9: Admin UI (works better after all APIs are ready)
- Phase 10: Seed data (populate for Phase 11 tests and Phase 9 UI)
- Phase 11: Tests (validate all phases work)
- Phase 12: Docs (final polish)

## Testing Strategy

Each phase produces working code tested via:
- **Unit tests:** Service layer logic (rule evaluation, conflict resolution, etc.)
- **Integration tests:** Full request/response cycle for critical paths
- **Manual testing:** Admin UI workflows (Phase 9 + 10)
- **End-to-end:** Full flow from ingest to review (Phase 11)

Do not aim for 100% coverage. Aim for meaningful coverage of:
- Resource ingestion (deduplication, file handling)
- Feature extraction (each extractor type)
- Rule evaluation (all operators, nested conditions)
- Conflict resolution (manual override, priority)
- Review workflow (all actions)
- Site config (per-site customization)

## Known Limitations (v1)

- No ASR (audio extraction)
- Keyframes limited to 3-5 per video (no full frame sequence)
- No external ML models (Tesseract OCR only; placeholder interfaces for future)
- No multi-user concurrent review sessions (sequential OK)
- No batch operations (single-resource endpoints)
- No export/archive of audit logs
- No recommendation engine or semantic ranking
- Admin UI is bare-minimum (functional, not polished)
- Local dev only (no production deployment guide in v1)

## Success Criteria

By end of Phase 12:
- [ ] Backend starts without errors; health check works
- [ ] `POST /resources` accepts image/video, stores resource, enqueues extraction
- [ ] Feature extraction runs asynchronously; features appear in database
- [ ] Rules evaluate and infer tags based on features
- [ ] Conflict resolution prevents tag duplicates and respects manual tags
- [ ] Review workflow approves/rejects/corrects tags; all actions logged
- [ ] Per-site tag config allows customization of display
- [ ] Admin UI loads resources, shows features, allows tag review
- [ ] Seed data populates example tags, rules, site config
- [ ] Tests pass for all critical paths
- [ ] Documentation is complete and examples work
- [ ] End-to-end flow (ingest → extract → infer → review → display) works

---

## Sources & References

- Origin spec: User-provided comprehensive system design (12 phases, detailed data model, API surface)
- FastAPI reference: `/Users/dex/YD 2026/projects/production/video-watermark-removal-system/api/`
- Technology stack: Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL, Redis, React
- External docs: FastAPI, SQLAlchemy 2.0, Alembic (inline URLs in Context & Research)
