# CHANGELOG

## [0.1.2] - 2026-04-13

### Added
- **Timeout Control:** Per-call (30s) and pipeline-level (60s) timeouts using Promise.race
  - scorePrompt and optimizePrompt now accept timeoutMs parameter (default 30s)
  - optimizeAndScoreService enforces 60s total pipeline timeout
- **Enhanced Retry Jitter Algorithm:** Improved exponential backoff with dynamic upper bound capping
  - Added Retry-After header parsing (supports both seconds and HTTP-date formats)
  - Dynamic maximum delay capping at min(base * 2, 30000ms) to prevent excessive waits
  - Improved jitter distribution (0.8-1.2x range) for thundering herd mitigation

### Changed
- **Improved Rate Limit Detection:** Extended beyond HTTP 429 status code
  - New isRateLimitError() function detects: status 429, RateLimit-Remaining=0, Retry-After header
  - Support for RateLimit-Reset header parsing for precise retry timing
  - Graceful degradation when rate limit indicators appear

### Fixed
- Fixed optimization service tests to expect timeout parameters in LLM call assertions
- Scoring service test fixture values corrected

## [0.1.1] - 2026-04-13

### Added
- Environment variable documentation (NEXTAUTH_SECRET, NEXTAUTH_URL)
- Test infrastructure for analytics route with SQL mock support

### Changed
- **Performance:** Moved analytics aggregations from JavaScript to SQL for better scalability
  - Time series data now computed with SQL date grouping (substr)
  - Score distribution bucketing now uses SQL CASE statements
  - Top users ranking now computed with SQL GROUP BY + JOIN
- **React optimization:** Added memoization to frequently-rendering components
  - ScoreDisplay wrapped with React.memo
  - OptimizationResult wrapped with React.memo with useMemo for calculations
  - Admin dashboard dimensionData wrapped with useMemo to prevent Recharts re-renders
  - Main page handleCopy callback wrapped with useCallback

### Fixed
- Removed console.error calls from dashboard client components (silent error handling via UI state)
- Analytics test coverage for new SQL-based aggregation methods

## [0.1.0] - 2026-04-08

Initial release of Prompt Optimizer MVP.
