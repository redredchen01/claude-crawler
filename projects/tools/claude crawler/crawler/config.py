"""Default configuration constants."""

MAX_PAGES = 200
MAX_DEPTH = 3
RATE_LIMIT = 1.0  # seconds between requests
RETRY_COUNT = 3
RETRY_BACKOFF = [1, 3, 9]  # seconds

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
