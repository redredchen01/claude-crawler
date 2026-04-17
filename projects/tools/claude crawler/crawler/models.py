"""Data models as Python dataclasses."""

from concurrent.futures import Future
from dataclasses import dataclass, field


@dataclass
class ScanJob:
    id: int | None = None
    entry_url: str = ""
    domain: str = ""
    status: str = "pending"  # pending, running, completed, failed
    max_pages: int = 200
    max_depth: int = 3
    pages_scanned: int = 0
    resources_found: int = 0
    created_at: str = ""
    completed_at: str | None = None
    cache_hits: int = 0
    cache_misses: int = 0


@dataclass
class Page:
    id: int | None = None
    scan_job_id: int = 0
    url: str = ""
    page_type: str = "other"  # list, detail, tag, other
    depth: int = 0
    status: str = "pending"  # pending, fetched, parsed, failed
    fetched_at: str | None = None
    failure_reason: str = ""
    cached: bool = False


@dataclass
class Resource:
    id: int | None = None
    scan_job_id: int = 0
    page_id: int | None = None
    title: str = ""
    url: str = ""
    cover_url: str = ""
    views: int = 0
    likes: int = 0
    hearts: int = 0
    category: str = ""
    published_at: str = ""
    popularity_score: float = 0.0
    raw_data: str = ""  # JSON string
    tags: list[str] = field(default_factory=list)


@dataclass
class Tag:
    id: int | None = None
    scan_job_id: int = 0
    name: str = ""
    resource_count: int = 0


@dataclass
class ParseResult:
    """Result from parsing a single page."""
    page_type: str = "other"
    resources: list[Resource] = field(default_factory=list)
    links: list[str] = field(default_factory=list)


# --- Inter-thread message types ---

@dataclass
class RenderRequest:
    """Worker-to-render-thread request. Worker awaits `future.result()`."""
    url: str
    future: Future  # Future[str | None] — resolved HTML or exception


@dataclass
class InsertPageRequest:
    """Orchestrator/Frontier-to-writer request. Caller awaits `future.result()` for page_id."""
    scan_job_id: int
    url: str
    depth: int
    future: Future  # Future[int] — resolved page_id


@dataclass
class InsertPagesBatchRequest:
    """Frontier-to-writer request for a batch of (url, depth) pairs.

    The writer does ONE BEGIN IMMEDIATE / executemany INSERT OR IGNORE /
    SELECT ... WHERE url IN (...) per request, returning page_ids ordered to
    match the input items. This collapses N fsyncs into one and lets
    Frontier.push exit its lock without waiting for any DB round-trip.
    """
    scan_job_id: int
    items: list[tuple[str, int]]  # [(url, depth), ...]
    future: Future  # Future[list[int]] — resolved page_ids in input order


@dataclass
class PageWriteRequest:
    """Worker-to-writer request. Writer commits per message and (when ``reply``
    is supplied) signals success/failure to the worker via that Future so
    counter increments only happen on confirmed-committed writes.
    """
    scan_job_id: int
    page_id: int
    parse_result: ParseResult | None
    page_status: str                  # "fetched" | "failed"
    page_type: str = "other"
    failure_reason: str | None = None
    reply: Future | None = None       # Future[bool] — True on commit, exception on rollback


@dataclass
class ScanJobUpdateRequest:
    """Final job-state update, sent via writer as last operation before shutdown."""
    scan_job_id: int
    status: str                        # "completed" | "failed" | "cancelled"
    pages_scanned: int = 0
    resources_found: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
