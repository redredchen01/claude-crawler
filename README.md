# Claude Crawler

A high-performance website crawler with structured-data-first extraction, HTTP response caching, and intelligent tag analysis. Built with Python, featuring concurrent workers, SSRF protection, and a Streamlit UI.

**Features:**
- 🚀 **Concurrent crawling** — BFS frontier with configurable worker threads and domain-aware rate limiting
- 🏗️ **Structured-first extraction** — JSON-LD → OpenGraph → Twitter Card → microdata → DOM fallback
- 💾 **HTTP caching** — ETag + Last-Modified conditional requests (304 Not Modified support)
- 🔒 **Security** — SSRF protection, private host detection, configurable redirect limits
- 📊 **Tag analysis** — Extract and rank popular resource tags from crawled pages
- 🎨 **Interactive UI** — Streamlit dashboard for scan monitoring and result exploration
- ✅ **Well-tested** — 706 tests covering crawling, parsing, caching, and API logic

## Quick Start

### Installation

```bash
pip install -e .
```

### CLI Usage

```bash
# Start a scan
python app.py

# View scan results
# → http://localhost:8501
```

### API Usage

```python
from crawler.core.engine import CrawlEngine
from crawler.config import Config

config = Config(
    start_url="https://example.com",
    max_pages=100,
    worker_count=4,
)

engine = CrawlEngine(config)
job = engine.run()

print(f"Pages crawled: {job.pages_done}")
print(f"Resources found: {job.resources_found}")
print(f"Cache hits: {job.cache_hits}")
```

## Architecture

### Core Components

| Component | Role |
|-----------|------|
| **Frontier** | BFS URL queue with domain-based duplicate detection |
| **FetcherThread** | HTTP requests with connection pooling and conditional caching |
| **ParserThread** | HTML parsing and tag extraction (multi-signal ranking) |
| **WriterThread** | Result persistence to SQLite |
| **RenderThread** | JavaScript rendering via Playwright (optional) |
| **CacheService** | HTTP cache with ETag/Last-Modified validation |

### Extraction Pipeline

```
HTML Response
    ↓
1. JSON-LD (structured data)
    ↓ (fallback if missing)
2. OpenGraph (og:* tags)
    ↓ (fallback)
3. Twitter Card (twitter:* tags)
    ↓ (fallback)
4. Microdata (itemscope)
    ↓ (fallback)
5. DOM parsing (h1, p, meta)
```

Each signal includes **provenance tracking** — know which extractor found each piece of data.

## Configuration

Environment variables in `crawler/config.py`:

```python
# Crawling
WORKER_COUNT = 4
MAX_PAGES = 1000
MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 10 MB cap per page
HTTP_TIMEOUT = 10  # seconds

# Caching
CACHE_ENABLED = True
MAX_REDIRECTS = 5

# Security
ALLOW_PRIVATE_HOSTS = False  # SSRF protection

# Rate limiting
DOMAIN_RATE_LIMIT = 2  # requests per second
```

## Testing

Run all tests:

```bash
pytest tests/ -v
```

Coverage:

```bash
pytest tests/ --cov=crawler --cov-report=html
```

Test categories:
- **Fetcher tests** — HTTP requests, caching, conditional headers
- **Parser tests** — Structured data extraction, fallback chains
- **Crawler tests** — Engine lifecycle, worker coordination
- **Export tests** — CSV/JSON result formatting
- **Cache tests** — ETag/Last-Modified validation

## Database Schema

SQLite database with 11 tables:

- `scans` — Crawl jobs (start_url, worker_count, pages_done, cache_hits/misses)
- `pages` — Crawled URLs (title, description, status_code, fetched_at)
- `resources` — Extracted tags/links (type, name, url, confidence)
- `raw_data` — Structured data (json_ld, og, twitter, microdata, dom)
- `provenance` — Data source tracking (extractor_name, signal_type)

See `crawler/storage.py` for schema details.

## Performance

**Benchmarks** (100-page crawl, 4 workers):
- Fetch phase: ~2-3 sec (with connection pooling)
- Parse phase: ~1 sec
- Total: ~3-4 sec + network I/O
- Cache hit rate: 30-50% on repeated scans

**Optimization highlights:**
- Module-level Session reuse (avoid TLS handshake per request)
- Stream-abort on oversized bodies (MAX_RESPONSE_BYTES)
- Domain rate limiting (prevent crawler bans)
- Conditional requests (save bandwidth on cached pages)

## Known Limitations & Next Steps

### Phase 2 (UI Enhancement)
- [x] Real-time progress streaming
- [x] Scan history + filtering
- [x] Export scheduler (email results)

### Phase 3 (Advanced Features)
- [x] Clustering by content similarity
- [x] Keyword frequency analysis
- [x] Trend detection (GA integration)
- [x] **Sentinel Recurring Monitor** (Phase 15 auto-scanning)
- [x] **Tag Velocity Analysis** (Identifying Rising Stars)

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Add tests for new functionality
4. Run `pytest` to verify
5. Submit a pull request

## License

MIT

## Resources

- [HTTP Caching Plan](docs/plans/2026-04-17-001-feat-http-response-caching-plan.md)
- [Structured-First Extraction Plan](docs/plans/2026-04-17-005-refactor-structured-data-first-extraction-plan.md)
- [Performance Scaling Requirements](docs/brainstorms/2026-04-17-crawler-performance-scaling-requirements.md)
