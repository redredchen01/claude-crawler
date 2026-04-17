---
date: 2026-04-17
topic: http-response-caching
type: feat
status: active
---

# HTTP Response Caching with ETag & Last-Modified — Technical Plan

## Problem Frame

When operators re-crawl the same domains (e.g., monitoring for content changes, re-analyzing with improved parser), the fetcher downloads identical responses multiple times. For a 200-page domain crawled weekly, HTTP requests consume bandwidth and time even when content has not changed. Implementing HTTP caching using ETag and Last-Modified headers enables conditional requests and 304 Not Modified responses to skip re-download, reducing bandwidth 40-60% on repeated crawls.

**Origin:** `docs/brainstorms/2026-04-17-http-response-caching-requirements.md`

---

## Requirements Traceability

| Unit | Requirements Covered |
|------|----------------------|
| **1. Database Schema** | R1, R2, R3 (cache storage, metadata, durability) |
| **2. Fetcher Conditional Logic** | R4, R5, R6, R7, R12, R13 (conditional headers, 304 handling, logging) |
| **3. Cache Service** | R1, R2, R4, R5, R6 (abstracted cache CRUD operations) |
| **4. Cache Metrics** | R14 (hit count, byte savings, per-domain size) |
| **5. Streamlit UI** | R8, R9, R10, R12 (enable/disable toggle, clear button, cache status display) |
| **6. Integration & Edge Cases** | R15, R16, R17, R18 (error/corruption handling, non-cacheable responses) |

---

## High-Level Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Crawler Engine (engine.py)                              │
├─────────────────────────────────────────────────────────┤
│  For each URL:                                          │
│    1. Check http_cache by url                           │
│    2. If hit: build If-None-Match / If-Modified-Since   │
│    3. Fetch with conditional headers                    │
│    4. On 304: reuse cached body, log "cached"           │
│    5. On 200: save to cache, log "fetched"              │
│    6. On 4xx/5xx: don't cache, log with reason          │
└─────────────────────────────────────────────────────────┘
        │
        ├── crawler/core/fetcher.py
        │   └─ _attempt_fetch() sends conditional headers
        │
        ├── crawler/cache.py (NEW)
        │   └─ CacheService: get_cache, save_cache, 
        │      invalidate_cache, get_metrics
        │
        └── crawler/storage.py
            ├─ http_cache table (url, etag, last_modified, ...)
            ├─ _migrate_http_cache() creates table
            └─ Query helpers: get_cached_response, save_cached_response
```

### Data Flow on Re-Crawl

```
fetch(url) →
  cache.get_cache(url) →
    [MISS] fetch with no conditional headers →
      [200] save to cache, update pages.cached=FALSE
      [4xx/5xx] skip cache, log reason
    [HIT] fetch with If-None-Match/If-Modified-Since →
      [304] reuse cached body, update pages.cached=TRUE
      [200 new content] save to cache, update pages.cached=FALSE
      [4xx/5xx] treat as cache miss, re-fetch fresh
```

### Cache Storage Decision

**Normalized approach:**
- Separate `http_cache` table (url TEXT PRIMARY KEY, etag, last_modified, cache_control, cached_at, response_body BLOB)
- pages table: add `cached BOOLEAN` to track "was this response from cache" on this fetch
- Cache is URL-scoped, durable across scan sessions
- On each fetch: check cache by URL, send conditional headers if cached, reuse body on 304

**Rationale:** Separation keeps pages table clean, allows cache to outlive scan jobs, enables bulk cache operations (clear, metrics) without scanning pages table.

---

## Implementation Units

### Unit 1: Database Schema & Migration
**Files:** `crawler/storage.py`, `crawler/models.py`  
**Complexity:** Low  
**Estimated LOC:** 80-120  
**Dependency:** None

**What it does:**
- Create `http_cache` table: (url TEXT UNIQUE NOT NULL, etag TEXT, last_modified TEXT, cache_control TEXT, cached_at TIMESTAMP, response_body BLOB, size_bytes INTEGER)
- Add `cached BOOLEAN DEFAULT FALSE` column to pages table (tracks if this page fetch used cached response)
- Implement `_migrate_http_cache()` following existing pattern (PRAGMA busy_timeout + BEGIN IMMEDIATE)
- Add Page dataclass fields: `cached: bool = False`

**Exact Changes:**
- `crawler/storage.py:_migrate_http_cache()` — new migration function (15-20 lines)
  - Create http_cache table with UNIQUE constraint on url
  - Alter pages table add cached column
  - Follow pattern from `_migrate_pages_add_failure_reason()` for safety
- `crawler/models.py:Page` — extend dataclass with `cached: bool = False`
- `crawler/storage.py` — add helper methods:
  - `get_cached_response(conn, url: str) -> dict | None` — returns {etag, last_modified, cache_control, cached_at, response_body, size_bytes}
  - `save_cached_response(conn, url: str, etag: str | None, last_modified: str | None, cache_control: str | None, body: bytes)` — UPSERT into http_cache
  - `clear_http_cache(conn)` — DELETE FROM http_cache
  - `get_cache_metrics(conn) -> dict` — returns {hit_count, total_bytes, per_domain_stats}

**Test Scenarios (`test_storage.py`):**
1. Migration creates http_cache table with correct schema
2. Migration adds cached column to pages table (idempotent)
3. get_cached_response returns None for uncached URL
4. save_cached_response inserts new cache entry correctly
5. save_cached_response updates existing entry (UPSERT)
6. clear_http_cache deletes all entries
7. get_cache_metrics returns accurate counts and sizes
8. Concurrent writes to http_cache (WriterThread pattern) don't corrupt data

---

### Unit 2: Fetcher — Conditional Request Logic
**Files:** `crawler/core/fetcher.py`, `crawler/cache.py` (new)  
**Complexity:** Medium  
**Estimated LOC:** 120-180  
**Dependency:** Unit 1

**What it does:**
- Modify `_attempt_fetch()` to accept optional cache metadata (etag, last_modified)
- Build conditional headers: `If-None-Match: {etag}`, `If-Modified-Since: {last_modified}`
- Handle 304 Not Modified response: early return with cached body
- Handle other status codes normally (200 updates cache, 4xx/5xx skip cache)
- Return response tuple: (status_code, body, headers, is_cached: bool)

**Exact Changes:**
- `crawler/core/fetcher.py:_attempt_fetch()` — extend signature
  - Add params: `cached_etag: str | None = None, cached_last_modified: str | None = None, cached_body: bytes | None = None`
  - Before sending request, build conditional headers dict:
    ```python
    conditional_headers = {}
    if cached_etag:
        conditional_headers['If-None-Match'] = cached_etag
    if cached_last_modified:
        conditional_headers['If-Modified-Since'] = cached_last_modified
    ```
  - Merge into request headers: `headers.update(conditional_headers)`
  - After response received, check status:
    - If 304: return (304, cached_body, {}, is_cached=True)
    - If 200: return (200, body, headers, is_cached=False)
    - If 4xx/5xx: return status normally, is_cached=False
- `crawler/core/fetcher.py:fetch()` — wrapper that:
  - Calls cache service to get cached metadata
  - Calls `_attempt_fetch()` with cache params
  - Returns is_cached flag to caller
- Return type: `tuple[int, bytes, dict[str, str], bool]` (status, body, headers, is_cached)

**Test Scenarios (`test_fetcher.py`):**
1. Unconditional fetch (no cache): sends normal request, returns body + headers
2. Conditional fetch with ETag match: sends If-None-Match header
3. Conditional fetch with Last-Modified: sends If-Modified-Since header
4. 304 response: returns (304, cached_body, {}, is_cached=True)
5. 200 response with new content: returns (200, new_body, headers, is_cached=False)
6. 4xx/5xx error: skips caching, returns error status
7. Malformed ETag header: gracefully degrades to conditional request without ETag
8. Missing Last-Modified header: gracefully handles absence

---

### Unit 3: Cache Service Abstraction
**Files:** `crawler/cache.py` (new)  
**Complexity:** Low-Medium  
**Estimated LOC:** 100-150  
**Dependency:** Unit 1

**What it does:**
- Encapsulate cache CRUD operations in CacheService class
- Methods: `get_cache(url)`, `save_cache(url, etag, last_modified, cache_control, body)`, `invalidate_cache(url)`, `invalidate_all()`, `get_metrics()`
- Handle database access via storage module
- Log cache operations at debug level

**Class Definition:**
```python
class CacheService:
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def get_cache(self, url: str) -> dict | None:
        """Fetch cached response metadata + body for URL."""
        # Calls storage.get_cached_response()
        
    def save_cache(self, url: str, etag: str | None, 
                   last_modified: str | None, cache_control: str | None,
                   body: bytes) -> None:
        """Store or update cached response."""
        # Calls storage.save_cached_response()
        
    def invalidate_cache(self, url: str) -> None:
        """Remove specific URL from cache."""
        
    def invalidate_all(self) -> None:
        """Clear entire cache."""
        # Calls storage.clear_http_cache()
        
    def get_metrics(self) -> dict:
        """Return cache hit count, byte savings, per-domain stats."""
        # Calls storage.get_cache_metrics()
```

**Test Scenarios (`test_cache.py`):**
1. get_cache(uncached_url) returns None
2. save_cache then get_cache returns correct metadata + body
3. save_cache (update) overwrites existing entry
4. invalidate_cache removes URL from cache
5. invalidate_all clears entire cache
6. get_metrics returns accurate counts
7. Multiple concurrent save/get operations (no data corruption)

---

### Unit 4: Cache Metrics & Diagnostics
**Files:** `crawler/storage.py`, `crawler/analysis.py`  
**Complexity:** Low  
**Estimated LOC:** 40-60  
**Dependency:** Unit 1, Unit 2

**What it does:**
- Add cache hit/miss tracking to page results
- Calculate byte savings (cached responses vs re-fetch)
- Aggregate metrics per domain
- Display in crawl summary

**Exact Changes:**
- `crawler/storage.py:get_cache_metrics()` — query http_cache table for:
  - Total cache size (sum of size_bytes)
  - Cache hit count (count of pages.cached=TRUE in current scan)
  - Per-domain breakdown (group by domain from url)
  - Age of cache entries (cached_at column)
- `crawler/analysis.py:analyze_crawl()` — extend output dict:
  - `cache_stats: {hit_count, miss_count, total_size_bytes, bandwidth_saved_bytes, bandwidth_saved_percent}`
- `app.py` — display cache metrics in results section

**Test Scenarios (`test_analysis.py`):**
1. Crawl with caching disabled: cache_stats all zeros
2. Crawl with caching enabled, first run: hit_count=0, miss_count=N
3. Crawl with caching enabled, second run: hit_count>0, bandwidth_saved>0
4. Bandwidth calculation: accurately sums size_bytes for cache hits

---

### Unit 5: Streamlit UI — Cache Control
**Files:** `app.py`, `crawler/config.py`  
**Complexity:** Low  
**Estimated LOC:** 50-80  
**Dependency:** Unit 1, Unit 3

**What it does:**
- Add "Enable HTTP Caching" checkbox in sidebar (default checked)
- Add "Clear Cache" button with confirmation dialog
- Display cache metrics in results view
- Pass cache_enabled flag to crawler engine

**Exact Changes:**
- `crawler/config.py` — add constants:
  - `CACHE_ENABLED_DEFAULT = True`
  - `CACHE_STORAGE_DB = data/http_cache.db` (or same DB as pages)
- `app.py:main()` — extend sidebar section (lines ~130):
  ```python
  with st.sidebar:
      # ... existing sections ...
      with st.expander("🔄 Cache Settings"):
          st.session_state.cache_enabled = st.checkbox(
              "Enable HTTP Caching",
              value=st.session_state.get("cache_enabled", True),
              help="Cache responses with ETag/Last-Modified to reduce bandwidth on re-crawls"
          )
          
          col1, col2 = st.columns(2)
          with col1:
              if st.button("Clear Cache", use_container_width=True):
                  st.session_state.pending_clear_cache = True
          with col2:
              if st.button("Cache Metrics", use_container_width=True):
                  st.session_state.show_cache_metrics = True
  
  # Clear cache confirmation
  if st.session_state.get("pending_clear_cache"):
      st.warning("This will delete all cached responses. Continue?")
      col1, col2 = st.columns(2)
      with col1:
          if st.button("Confirm Clear", key="confirm_clear"):
              cache_service.invalidate_all()
              st.session_state.pending_clear_cache = False
              st.success("Cache cleared")
              st.rerun()
      with col2:
          if st.button("Cancel", key="cancel_clear"):
              st.session_state.pending_clear_cache = False
              st.rerun()
  ```
- `app.py:render_crawl_results()` — extend metrics display:
  ```python
  if crawl_analysis.get("cache_stats"):
      with st.expander("💾 Cache Metrics"):
          col1, col2, col3 = st.columns(3)
          col1.metric("Cache Hits", crawl_analysis["cache_stats"]["hit_count"])
          col2.metric("Bytes Saved", format_bytes(crawl_analysis["cache_stats"]["bandwidth_saved_bytes"]))
          col3.metric("Savings %", f"{crawl_analysis['cache_stats']['bandwidth_saved_percent']:.1f}%")
  ```
- `engine.py:crawl()` — accept `cache_enabled` parameter, pass to fetcher

**Test Scenarios (manual/browser-based):**
1. Checkbox enabled by default
2. Clear Cache button shows confirmation dialog
3. Confirm clears cache, shows success message
4. Cancel dismisses dialog without clearing
5. Cache metrics display after first crawl
6. Cache metrics show correct hit/miss counts on second crawl

---

### Unit 6: Integration & Edge Case Tests
**Files:** `tests/test_cache_integration.py` (new), `tests/conftest.py`  
**Complexity:** High  
**Estimated LOC:** 200-300  
**Dependency:** All units 1-5

**What it does:**
- End-to-end cache flow: first fetch → cache → re-fetch (304) → verify cached
- Edge cases: corrupted cache, stale ETag, server returns 404 after cache
- Performance verification: cache hit latency vs fresh fetch
- Error handling: non-cacheable responses (4xx, 5xx, no headers)

**Test Scenarios:**
1. **Cache Hit Flow:**
   - First crawl: fetch URL, cache response with ETag
   - Second crawl: fetch same URL, server returns 304, body reused from cache
   - Verify page.cached=TRUE on second fetch

2. **Cache Miss (New Content):**
   - First crawl: cache response with ETag=v1
   - Server updates content, new ETag=v2
   - Second crawl: server returns 200 with new body + new ETag
   - Verify cache updated with new ETag and body

3. **Non-Cacheable Responses:**
   - 4xx/5xx errors: don't cache, don't reuse cache
   - Missing ETag + Last-Modified: cache body but no headers
   - Cache-Control: no-store: skip caching

4. **Corrupted Cache:**
   - Cache entry has truncated response_body
   - Fetcher detects corruption (size_bytes mismatch), skips cache, re-fetches

5. **Stale URL (404 After Cache):**
   - URL cached with 200 status
   - Server returns 404 on second crawl
   - Don't reuse cache, treat as valid change (cache miss)

6. **Performance Benchmark:**
   - Mock network delay: fresh fetch ~200ms, cached fetch ~10ms
   - Verify cache hit avoids network latency

7. **Concurrent Cache Access:**
   - Two scan jobs fetch same URL simultaneously
   - Cache entry correctly written once (no race condition)

8. **Clear Cache Operation:**
   - Populate cache with 100 URLs
   - Clear cache
   - Verify http_cache table is empty
   - Next fetch proceeds as cold cache (no 304 expected)

---

## High-Level Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Separate http_cache table** | Keeps pages table clean, enables cache to outlive scan jobs, simplifies bulk cache operations (clear, metrics). Normalized design. |
| **URL as primary key** | Cache is URL-scoped; same URL across multiple scan jobs reuses cache. Supports use case "re-analyze with new parser" without re-downloading. |
| **Server headers only (Cache-Control/Expires)** | Maximizes correctness per RFC 7234. If server says "cache for 1 year", honor it. Defers client-side TTL to future (R7). |
| **Boolean cached flag in pages** | Tracks whether *this specific page fetch* used cached response. Enables metrics and diagnostics without re-querying http_cache. |
| **CacheService abstraction** | Encapsulates cache CRUD, enables future extensions (Redis fallback, distributed cache), keeps fetcher logic clean. |
| **WriterThread for cache writes** | Reuse existing pattern from Phase 2 (concurrency refactor) to ensure atomic cache updates alongside page writes. |
| **No client-side TTL for MVP** | Simplifies implementation. Cache persists until manual "Clear Cache" or server says different via headers. Optional LRU eviction in v2. |
| **All response types cached** | HTML, CSS, JS, images, media all benefit from caching. Storage cost manageable for typical 200-page crawl (~50MB). |

---

## Test Coverage Plan

| Test Type | Count | Location |
|-----------|-------|----------|
| Unit: Cache Storage | 8 | `test_storage.py` |
| Unit: Fetcher Conditional | 8 | `test_fetcher.py` |
| Unit: Cache Service | 7 | `test_cache.py` |
| Integration: Full Flow | 8 | `test_cache_integration.py` |
| **Total** | **31** | |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Cache corruption on app crash** | Medium | Store response_body as BLOB with size_bytes; verify size on read. CRC check optional for v2. |
| **ETag/Last-Modified misparse** | Low | Treat as non-cacheable if malformed; log warning. Fetch fresh on next attempt. |
| **SQLite locking on cache writes** | Medium | Use WriterThread pattern (existing) for all cache mutations. Ensures single-threaded writes. |
| **Cache staleness (old content served)** | Low | Honor Cache-Control headers strictly. If server returns stale content, that's server's responsibility (RFC 7234). |
| **Disk space pressure from cache** | Medium | For MVP: manual "Clear Cache" button. For v2: configurable size limit + LRU eviction (R76 decision). |
| **Performance regression on first crawl** | Low | Cache lookup is single indexed query; latency <1ms. No measurable overhead. |

---

## System-Wide Impact

**Modules affected:**
- `crawler/core/fetcher.py` — extend _attempt_fetch signature, handle 304
- `crawler/cache.py` — new CacheService class
- `crawler/storage.py` — new migration, helper methods
- `crawler/models.py` — extend Page dataclass
- `app.py` — sidebar toggles + results display
- `tests/` — new test files + extended existing tests

**Breaking changes:** None. All changes backward compatible:
- Cache columns nullable
- Cache toggles default to enabled (existing behavior unchanged)
- Fetcher return type unchanged (is_cached flag is new but optional)

**Backward compatibility:**
- Existing databases: migration adds columns safely (idempotent)
- Old crawl results: pages with cached=FALSE or NULL still valid
- Disabling cache: behaves exactly like current fetcher (no conditional headers)

---

## Success Metrics

✓ **Performance:** Repeated crawls of same 200-page domain show ≥40% reduction in total fetch time when cache is warm  
✓ **Correctness:** Content changes detected by parser (different tag counts, new resources) are correctly identified even with cached responses  
✓ **Durability:** Cache survives app restart and is reused on subsequent crawls (manual clear required to flush)  
✓ **User Experience:** UI clearly shows cache hit vs fresh fetch; users understand cache status  
✓ **Test Coverage:** ≥31 new tests, all passing, covering integration + edge cases  

---

## Rollout Plan

**Phase 1: Implement & Test (1-2 days)**
- Implement units 1-6 in dependency order
- Run test suite (should reach 520+ tests from current 493)
- Manual QA: verify cache behavior via Streamlit UI

**Phase 2: Merge & Deploy (same day)**
- Create PR from refactor/crawler-concurrency
- Run ce:review in report-only mode
- Merge to main
- Tag as v0.3.0 (feature: caching, security: SSRF gate, precision: parser Units 1-3)

**Phase 3: Monitor (1-2 weeks)**
- Track cache hit rates in production
- Monitor for stale content reports
- If cache size becomes issue, implement configurable limit (v2)

---

## Outstanding Questions

### Resolved Before Planning
- ✅ Cache storage location: SQLite (same DB as pages)
- ✅ Cache invalidation: server headers only (Cache-Control, Expires)
- ✅ Cache scope: all HTTP response types
- ✅ User control: per-crawl toggle (default enabled) + manual clear button
- ✅ Cache size: unbounded for v1, manual clear only

### Deferred to Implementation
- **[Optional]** CRC checksum for corruption detection (nice-to-have, can defer)
- **[Optional]** Content-Hash fallback if ETag/Last-Modified missing (nice-to-have, can use body size for now)
- **[v2]** Configurable cache size limit with LRU eviction
- **[v2]** Cache statistics dashboard (detailed hit/miss timeseries)
- **[Future]** Multi-machine cache sharing (Phase 6, distributed)

---

## Dependency Tree

```
Unit 1: Database Schema ────────┐
                                │
Unit 2: Fetcher Logic ←─────────┤
         + CacheService ←─ Unit 3: Cache Service ←─ Unit 1
         │
         └──→ Unit 4: Metrics ←─ Unit 1
         │
         └──→ Unit 5: UI ←─ Unit 1, Unit 3
                         │
                         └──→ Unit 6: Integration Tests
                              (depends on all units)
```

**Implementation order:**
1. Unit 1 (schema)
2. Unit 3 (cache service)
3. Unit 2 (fetcher)
4. Unit 4 (metrics)
5. Unit 5 (UI)
6. Unit 6 (integration tests + refinement)

---

## Status

✅ **Ready for implementation.** All technical decisions made, requirements traced, implementation units defined with specific file paths and test scenarios.

## Next Steps

→ **Implementation** via `/ce:work` using this plan as specification  
→ **Code Review** via `/ce:review` after each unit lands  
→ **QA Testing** via `/qa` before merging to main  
→ **Production Deploy** with v0.3.0 tag
