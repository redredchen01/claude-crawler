"""Default configuration constants."""

MAX_PAGES = 200
MAX_DEPTH = 3

# Legacy global rate limit (seconds between requests). Retained only for
# backward compatibility with older run_crawl callers; new code uses
# REQ_PER_SEC_PER_DOMAIN + token bucket.
RATE_LIMIT = 1.0

RETRY_COUNT = 3
RETRY_BACKOFF = [1, 3, 9]  # seconds

# --- Concurrency & rate limiting ---
WORKER_COUNT = 8
REQ_PER_SEC_PER_DOMAIN = 5.0
REQ_PER_SEC_MIN = 1.0
REQ_PER_SEC_MAX = 20.0

# --- Render thread ---
RENDER_TIMEOUT = 30  # seconds per page
RENDER_RETRY_COUNT = 2
BROWSER_SHUTDOWN_TIMEOUT = 5.0  # seconds before SIGKILL fallback
# Networkidle wait after page.goto. Default 0 = skip entirely (modern sites
# with WS/long-poll/persistent analytics never actually reach networkidle,
# so the previous unconditional 5s wait was pure latency tax). Operators
# who genuinely need it can set to e.g. 1500ms.
RENDER_WAIT_NETWORKIDLE_MS = 0
# Bounded queue: workers experience natural backpressure when render is the
# throughput bottleneck. submit() blocks up to RENDER_SUBMIT_TIMEOUT.
RENDER_QUEUE_SIZE = 16
RENDER_SUBMIT_TIMEOUT = 60.0

# --- Engine writer round-trip ---
# Worker waits up to this long for the writer's commit acknowledgement
# before treating the write as failed (counters skip, page stays 'pending'
# for resume). Generous bound; writer-down is detected sooner via
# WriterUnavailableError from the bounded queue.put.
WRITER_REPLY_TIMEOUT = 10.0

# --- Progress reporting ---
PROGRESS_FLUSH_MS = 250  # coalescer flush window

# --- R6a zero-resource retry ---
ZERO_RESOURCE_RETRY_PAGE_TYPES = frozenset({"list", "detail"})

# Popularity scoring weights
W_VIEWS = 0.4
W_LIKES = 0.3
W_HEARTS = 0.2
W_RECENCY = 0.1

# JS rendering detection threshold
JS_BODY_MIN_LENGTH = 1024  # bytes, below this triggers Playwright fallback

# User-Agent for requests
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# File extensions to skip when extracting links
SKIP_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mp3",
}

DB_PATH = "data/crawler.db"
