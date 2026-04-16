"""Data models as Python dataclasses."""

from dataclasses import dataclass, field
from datetime import datetime


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


@dataclass
class Page:
    id: int | None = None
    scan_job_id: int = 0
    url: str = ""
    page_type: str = "other"  # list, detail, tag, other
    depth: int = 0
    status: str = "pending"  # pending, fetched, parsed, failed
    fetched_at: str | None = None


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
