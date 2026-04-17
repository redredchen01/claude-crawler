---
date: 2026-04-17
topic: http-response-caching
---

# HTTP Response Caching with ETag & Last-Modified

## Problem Frame

When operators re-crawl the same domains (e.g., monitoring for content changes, re-analyzing with improved parser), the fetcher downloads identical responses multiple times. For a 200-page domain crawled weekly, HTTP requests consume bandwidth and time even when content has not changed.

The feature enables **HTTP caching using ETag and Last-Modified headers**, allowing subsequent crawls to:
1. Send conditional requests (`If-None-Match`, `If-Modified-Since`)
2. Skip downloading when server responds with 304 Not Modified
3. Reuse the cached response body from the prior crawl

This benefits both patterns:
- **Repeated crawls** (same domain monitored over weeks/months) see 40-60% bandwidth savings
- **Archive re-analysis** (bulk crawl once, re-parse with new parser logic) can skip re-downloads if parser is re-run

## Requirements

**Caching Storage**
- R1. Store cached HTTP response bodies (HTML, CSS, JS, images, media) in the SQLite database alongside page metadata
- R2. Track cache metadata per response: ETag, Last-Modified, Cache-Control headers, cached_at timestamp
- R3. Cache storage is durable across crawl sessions (survives restart)

**Cache Validation**
- R4. On re-fetch, send conditional request headers (If-None-Match for ETag, If-Modified-Since for Last-Modified) before downloading body
- R5. On 304 Not Modified response, reuse the cached response body without downloading
- R6. On 200 response with new content, update the cache with new body and metadata
- R7. Honor Cache-Control and Expires headers when present; omit client-side TTL logic

**Cache Control**
- R8. Cache is enabled by default on all crawls
- R9. Provide per-crawl toggle in Streamlit UI to disable caching for a specific crawl (bypass cache entirely)
- R10. Provide a "Clear Cache" button in Streamlit UI to manually flush all cached responses
- R11. Respect robots.txt and crawl-delay when cache is bypassed (same as normal crawl)

**Fetcher Behavior**
- R12. When cache hit (304), log response as "cached" in page results (not "fetched")
- R13. When cache miss (200 with new content), log as "fetched" as normal
- R14. Track cache metrics: hit count, byte savings, per-domain cache size

**Edge Cases**
- R15. If a URL is cached but server now returns 404/410, treat as valid cache miss (re-crawl detects the change)
- R16. If server returns invalid/malformed Cache-Control header, treat as non-cacheable (fetch fresh on next crawl)
- R17. If cached response is corrupted, treat as cache miss and re-fetch
- R18. Do not cache error responses (4xx, 5xx)

## Success Criteria

- **Performance**: Repeated crawls of the same 200-page domain show ≥40% reduction in total fetch time when cache is warm (consecutive crawls within cacheability window)
- **Correctness**: Content changes detected by parser (different tag counts, new resources) are correctly identified even when using cached responses; no false negatives
- **User experience**: UI clearly shows cache hit vs. fetch; users understand when content came from cache
- **Durability**: Cache survives application restart and is reused on subsequent crawls (manual "Clear Cache" is required to flush)

## Scope Boundaries

**Out of scope for this feature:**
- Distributed caching (multi-machine cache sync) — defer to Phase 6
- Cache warming strategies (proactive pre-fetching) — post-MVP exploration
- Content-aware cache eviction (age-based cleanup, LRU eviction by size) — defer if cache size becomes an issue
- Cache statistics dashboard — show basic metrics in UI, detailed analysis deferred
- Integration with HTTP proxy caches — client-side only

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite storage** | Single database, ACID guarantees, simple to implement alongside existing schema. Disk space cost is acceptable for MVP (typical 200-page crawl ~50MB HTML). |
| **Server headers only** | Respect Cache-Control/ETag strictly. No client-side TTL. Maximizes correctness; if server says "cache for 1 year", we honor it. |
| **All response types** | Cache HTML, CSS, JS, images, media. Maximizes bandwidth savings. Storage cost is manageable for typical crawls. |
| **Default on, per-crawl toggle** | Most users benefit from caching. Power users can bypass for testing/validation. |
| **Simple metrics** | Track hit/miss/bytes saved. Advanced analytics (cache churn, eviction rates) deferred. |
| **Cache size: Unbounded (v1)** | No hard limit for MVP. Manual "Clear Cache" is the eviction strategy. If users report disk pressure, add configurable size limit in v2 with LRU eviction. Simplifies initial implementation and defers optimization until we have real usage patterns. |

## Dependencies / Assumptions

- **Assumption:** Servers correctly implement Cache-Control and ETag headers (RFC 7232, 7234). If servers return broken headers, we degrade to non-cacheable behavior.
- **Assumption:** Cache is local to a single application instance. No cross-instance cache sharing (network shared cache deferred).
- **Dependency:** Storage schema must extend to include cache metadata columns (ETag, Last-Modified, Cache-Control, cached_at).

## Outstanding Questions

### Deferred to Planning
- **[Technical]** How to detect corrupted cache entries without re-downloading? CRC check on deserialize?
  - Better answered during implementation when serialization format is chosen.
- **[Technical]** Should Cache-Control's max-age take precedence over Last-Modified heuristic? (RFC 7234 Section 4.2.3)
  - Answer during implementation based on exact header parsing logic.

## Status

✅ **Ready for planning.** All product decisions resolved. No blocking questions remain.

## Next Steps

→ `/ce:plan` for structured implementation planning
