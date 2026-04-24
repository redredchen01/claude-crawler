from __future__ import annotations

import os
import random

"""Claude Crawler - Central Configuration Matrix."""

# --- Scan Defaults ---
MAX_PAGES = 200
MAX_DEPTH = 3
RATE_LIMIT = 1.0  # Legacy fallback
RETRY_COUNT = 3
RETRY_BACKOFF = [1, 3, 9]

# --- Database & Storage ---
DB_PATH = os.environ.get("DB_PATH", "data/crawler.db")
REDIS_URL = os.environ.get("REDIS_URL", None)  # Set for distributed mode
ROBOTS_CACHE_SIZE = 1000

# --- Network & Fetching ---
HTTP_TIMEOUT = (5, 15)
MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 10MB for rich media pages
HTTP_POOL_CONNECTIONS = 100
HTTP_POOL_MAXSIZE = 20
HTML_CONTENT_TYPE_MARKERS = ("html", "xhtml", "xml", "text/plain")
ALLOW_PRIVATE_HOSTS = os.environ.get("ALLOW_PRIVATE_HOSTS", "false").lower() == "true"
MAX_REDIRECTS = 10
# JS rendering detection threshold
JS_BODY_MIN_LENGTH = 1024  # bytes, below this triggers Playwright fallback

# --- Concurrency & Rate Limiting ---
WORKER_COUNT = 8
REQ_PER_SEC_PER_DOMAIN = 2.0
REQ_PER_SEC_MIN = 1.0
REQ_PER_SEC_MAX = 20.0

# --- Render Thread (Playwright) ---
RENDER_TIMEOUT = 45
RENDER_RETRY_COUNT = 2
BROWSER_SHUTDOWN_TIMEOUT = 5.0
RENDER_WAIT_NETWORKIDLE_MS = 0
RENDER_QUEUE_SIZE = 32
RENDER_SUBMIT_TIMEOUT = 60.0
SHADOW_DOM_PIERCING_ENABLED = True

# --- Tactical Arsenal (Levels 1-12) ---

# Stealth & UA
USER_AGENT_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
]
USER_AGENT = USER_AGENT_POOL[0]

# Proxy
PROXY_POOL = (
    os.environ.get("PROXY_POOL", "").split(",") if os.environ.get("PROXY_POOL") else []
)
PROXY_ROTATION_ENABLED = len(PROXY_POOL) > 0

# Captcha
CAPTCHA_SOLVER_KEY = os.environ.get("CAPTCHA_SOLVER_KEY", "")
CAPTCHA_SOLVER_PROVIDER = os.environ.get("CAPTCHA_SOLVER_PROVIDER", "2captcha")

# Discovery
DISCOVERY_MODE_ENABLED = os.environ.get("DISCOVERY_MODE", "false").lower() == "true"
MAX_DISCOVERED_DOMAINS = 50
DISCOVERY_KEYWORDS = {"recommend", "links", "portal", "推荐", "外链", "导航", "更多"}

# Swarm Intelligence
NODE_ID = os.environ.get("NODE_ID", f"node-{random.randint(1000, 9999)}")
CLUSTER_DISCOVERY_PORT = 19999
AUTO_CLONE_THRESHOLD_CPU = 30.0
MAX_NODES_PER_HOST = 4

# --- Filter & Cleaning ---
SKIP_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".7z",
    ".mp4",
    ".mp3",
    ".m4a",
    ".wav",
    ".mkv",
    ".avi",
    ".wmv",
    ".exe",
    ".dmg",
    ".iso",
    ".xml",
    ".rss",
    ".json",
    ".atom",
}

# --- Metrics Weights ---
W_VIEWS = 0.4
W_LIKES = 0.3
W_HEARTS = 0.2
W_RECENCY = 0.1

# --- Progress Reporting ---
PROGRESS_FLUSH_MS = 250
WRITER_REPLY_TIMEOUT = 10.0
ZERO_RESOURCE_RETRY_PAGE_TYPES = frozenset({"list", "detail"})
