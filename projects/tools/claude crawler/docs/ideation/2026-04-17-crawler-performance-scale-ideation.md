---
date: 2026-04-17
topic: crawler-performance-scale
focus: Performance & Scale (concurrency, caching, large-scale crawling)
---

# Ideation: Claude Crawler Performance & Scale Improvements

## Codebase Context

**Project:** Website resource scanner & tag analyzer (Python + Streamlit)  
**Status:** MVP complete (v0.1.0), Phase 2 concurrency shipped (WriterThread + RenderThread + ThreadPoolExecutor)  
**Recent work:** Parser precision Units 1-3, SSRF gate, 493/493 tests passing  
**Architecture:** BFS crawler, multi-worker fetcher (with connection pooling), parser (metrics/dates/covers/JSON-LD), Streamlit UI  
**Known scalability:** Single-machine 200-500 page crawls common; largest test crawl 500 pages

**Pain points observed:**
- Re-crawling same URLs fetches fresh HTML (no caching)
- Parser profile shows HTML load is often the bottleneck for large pages
- Rate limiting is static token bucket (no server response adaptation)
- Resource filtering at page level, not per-resource
- News sites with 100K+ articles require crawl all or none

## Ranked Ideas

### 1. Smart Response Caching with ETags ⭐⭐⭐⭐⭐
**Status:** Unexplored → Being Brainstormed

**Description:**  
Implement HTTP caching layer using ETags and Last-Modified headers. Cache raw HTML responses locally; on re-crawl, send conditional requests (If-None-Match, If-Modified-Since). Skip re-download if server returns 304 Not Modified.

**Rationale:**
- Crawls often revisit same domains over time
- 40-60% of responses are unchanged (estimated from common patterns)
- Saves bandwidth, reduces server load, speeds up re-crawls
- Builds naturally on existing session + connection pooling
- Enables future delta-detection and incremental parsing

**Downsides:**
- Adds cache storage (local disk); needs cleanup strategy
- Cache invalidation complexity (stale content risk)
- Not useful for first-time crawls (no speedup)

**Confidence:** 85%  
**Complexity:** Medium  
**Evidence:** Fetcher already has httpx session pooling; response body available; storage schema can extend for cache metadata

---

### 2. Incremental Delta Detection ⭐⭐⭐⭐
**Status:** Unexplored

**Description:**  
Track resource metadata (content hash, published date, size). On re-visit, compare metadata. If unchanged, skip re-parse; reuse prior analysis. Update only if detected change.

**Rationale:**
- Many pages never change (archived content, static pages)
- Avoids redundant parser CPU for unchanged content
- Powers "update scan" use case (find what's new since last crawl)
- Enables analytics on change frequency

**Downsides:**
- Requires metadata storage; schema extension
- Hash computation overhead on each fetch
- Only beneficial for re-crawls (useless first time)

**Confidence:** 80%  
**Complexity:** High  
**Evidence:** Storage schema has `updated_at` but no content hash tracking; parser already computes metrics that could serve as change signals

---

### 3. Adaptive Rate Limiting with Backoff ⭐⭐⭐⭐
**Status:** Unexplored

**Description:**  
Replace static token bucket with adaptive algorithm: detect 429 (too many requests) and 503 (service unavailable) responses, apply exponential backoff with jitter. Resume when server healthy.

**Rationale:**
- Current token bucket is static per domain
- Polite crawlers adapt to server capacity
- Avoids IP blocks and crawler bans
- Better user experience (fewer failed fetches)

**Downsides:**
- Adds complexity to fetcher error handling
- May slow crawls (intended behavior, but user might perceive as delay)

**Confidence:** 90%  
**Complexity:** Medium  
**Evidence:** Fetcher already has retry logic; status codes available; rate limiter is modular (ratelimit.py)

---

### 4. Selective Crawl Policies ⭐⭐⭐⭐
**Status:** Unexplored

**Description:**  
Allow sampling/filtering rules: "crawl top 5% by traffic", "one resource per type", "only content < 1 week old", "sample 1 in N links". Config-driven rather than boolean max-pages.

**Rationale:**
- News sites have 100K+ articles; crawling all is wasteful
- Sampling maintains statistical coverage without full crawl
- Reduces crawl time 10-100x for large sites
- UX-friendly: dropdown selectors for common strategies

**Downsides:**
- Adds branching logic to crawler
- Users must understand sampling bias
- Not useful for small/focused crawls

**Confidence:** 85%  
**Complexity:** Low  
**Evidence:** Max pages config exists; frontier is filter-friendly; UI already has sliders for similar config

---

### 5. Content-Type Smart Filtering ⭐⭐⭐
**Status:** Unexplored

**Description:**  
Set per-resource type size limits (images <10MB, PDFs <50MB, skip video/audio). More granular than current 5MB/page cap.

**Rationale:**
- Saves bandwidth on bloated media
- Respects resource categories (images less critical than HTML)
- Cheaper per-resource filtering than page-level bulk
- Pairs well with caching (cache only useful resources)

**Downsides:**
- Adds config surface (more options = more confusion)
- Edge cases (large SVGs that are critical, small videos)

**Confidence:** 75%  
**Complexity:** Low  
**Evidence:** Fetcher already has content-type checks; headers available before body download

---

### 6. Parser Execution Profiling Dashboard ⭐⭐⭐
**Status:** Unexplored

**Description:**  
Built-in metrics for per-parser step timing (HTML load, CSS selector eval, link extraction, metadata extraction). Histogram dashboard showing bottlenecks.

**Rationale:**
- Current profiling shows aggregate; hard to spot bottlenecks
- Powers optimization targeting (e.g., CSS selector compilation caching)
- Enables future distributed parser (if step X is slow, shard it)
- Low-hanging fruit visualization

**Downsides:**
- Adds telemetry overhead (small)
- Dashboard clutter if not designed carefully

**Confidence:** 70%  
**Complexity:** Low  
**Evidence:** Progress queue tracks page count; timing hooks already exist in core execution; Streamlit renders simple metrics

---

## Rejection Summary

| Idea | Reason Rejected |
|------|-----------------|
| Distributed Crawling: Multi-Machine Pool | Too early; single-machine bottleneck not yet hit (200-500 page crawls are common). Architectural redesign required. Defer to Phase 6. |
| Parser Streaming Mode (Chunked Processing) | Wrong timing; 5MB page cap already handles 99% of cases. Add only if profiling shows OOM issues. Not a scaling blocker. |
| Semantic Resource Deduplication | Overlaps with Idea #2 (delta detection covers this). Stricter parser + change detection is simpler. |
| Persistent Progress Checkpoints | Already shipped in commit 4ccef2a. Resume via insert-at-push-time. |

---

## Session Log

- **2026-04-17 18:35 UTC:** Initial open-ended ideation on Performance & Scale — 10 candidates generated, 6 survived after filtering. Focus: concurrency, caching, large-scale patterns.
- **2026-04-17 18:40 UTC:** User selected Idea #1 (Smart Response Caching with ETags) for brainstorming → Invoking ce:brainstorm.

---

## Next Actions

Brainstorming Idea #1 (Smart Response Caching with ETags) to define scope, requirements, and implementation units.
