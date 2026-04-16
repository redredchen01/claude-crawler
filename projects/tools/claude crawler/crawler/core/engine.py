"""Main crawl engine — BFS loop with rate limiting and progress reporting."""

import logging
import queue
import sqlite3
import time
from urllib.parse import urlparse, urlunparse
from urllib.robotparser import RobotFileParser

from crawler.core.frontier import Frontier
from crawler.core.fetcher import fetch_page, needs_js_rendering
from crawler.parser import parse_page
from crawler.storage import (
    init_db, create_scan_job, update_scan_job, insert_page, update_page,
    save_resource_with_tags,
)

logger = logging.getLogger(__name__)


def _check_robots(url: str, robots_cache: dict[str, RobotFileParser | None], user_agent: str) -> bool:
    """Check robots.txt for the given URL. Caches per domain.

    If robots.txt cannot be fetched or parsed (403, 404, timeout, etc.),
    allow crawling per RFC 9309.
    """
    parsed = urlparse(url)
    domain = parsed.netloc
    if domain not in robots_cache:
        robots_url = f"{parsed.scheme}://{domain}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        try:
            rp.read()
            # RobotFileParser.read() silently fails on 403/404 — entries will be empty
            # and can_fetch defaults to deny-all. Treat empty entries as "no restrictions".
            if not rp.entries:
                logger.warning("robots.txt unreadable for %s (empty/403/404), allowing all", domain)
                robots_cache[domain] = None
            else:
                robots_cache[domain] = rp
        except Exception:
            logger.warning("Could not fetch robots.txt for %s, allowing all", domain)
            robots_cache[domain] = None
    rp = robots_cache[domain]
    if rp is None:
        return True
    return rp.can_fetch(user_agent, url)


def _normalize_url(url: str) -> str:
    """Normalize URL for deduplication: strip fragment, lowercase domain, lowercase path."""
    parsed = urlparse(url)
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    # Remove trailing slash for consistency
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((parsed.scheme, netloc, path, parsed.params, parsed.query, ""))


def _send_progress(progress_queue: queue.Queue | None, data: dict) -> None:
    if progress_queue is not None:
        progress_queue.put(data)


def run_crawl(
    entry_url: str,
    db_path: str,
    max_pages: int = 200,
    max_depth: int = 3,
    rate_limit: float = 1.0,
    progress_queue: queue.Queue | None = None,
) -> int:
    """Run a BFS crawl starting from entry_url. Returns scan_job_id."""
    from crawler.config import USER_AGENT

    # Init DB and create job
    init_db(db_path)
    domain = urlparse(entry_url).netloc
    scan_job_id = create_scan_job(db_path, entry_url, domain, max_pages, max_depth)
    update_scan_job(db_path, scan_job_id, status="running")

    frontier = Frontier(entry_url, max_pages, max_depth)
    robots_cache: dict[str, RobotFileParser | None] = {}
    pages_done = 0
    resources_found = 0

    try:
        while not frontier.is_done() and pages_done < max_pages:
            item = frontier.pop()
            if item is None:
                break
            url, depth = item

            # Robots.txt check
            if not _check_robots(url, robots_cache, USER_AGENT):
                logger.info("Blocked by robots.txt: %s", url)
                continue

            # Fetch page
            html = fetch_page(url, use_playwright=False)
            if html is not None and needs_js_rendering(html):
                logger.info("Page needs JS rendering, retrying with playwright: %s", url)
                js_html = fetch_page(url, use_playwright=True)
                if js_html is not None:
                    html = js_html

            # Record page in DB
            page_id = insert_page(db_path, scan_job_id, url, depth=depth)
            if page_id and html:
                update_page(db_path, page_id, status="fetched")
            elif page_id:
                update_page(db_path, page_id, status="failed")

            pages_done += 1

            # Parse page: extract resources, links, and page type
            if html:
                result = parse_page(html, url)

                # Update page type from parser
                if page_id:
                    update_page(db_path, page_id, page_type=result.page_type)

                # Save extracted resources (use batch connection for efficiency)
                # Batch: open connection once, save all resources, close once
                if result.resources:
                    batch_conn = sqlite3.connect(db_path)
                    batch_conn.execute("PRAGMA journal_mode=WAL")
                    batch_conn.execute("PRAGMA foreign_keys=ON")
                    batch_conn.row_factory = sqlite3.Row
                    try:
                        for resource in result.resources:
                            # Normalize URL to reduce duplicates
                            resource.url = _normalize_url(resource.url)
                            resource.scan_job_id = scan_job_id
                            resource.page_id = page_id
                            saved_id = save_resource_with_tags(db_path, resource, conn=batch_conn)
                            if saved_id:
                                resources_found += 1
                        batch_conn.commit()
                    finally:
                        batch_conn.close()

                # Push discovered links to frontier
                for link in result.links:
                    frontier.push(link, depth + 1)

            # Progress
            _send_progress(progress_queue, {
                "pages_done": pages_done,
                "pages_total": max_pages,
                "current_url": url,
                "status": "running",
            })

            # Rate limit
            if not frontier.is_done():
                time.sleep(rate_limit)

        update_scan_job(db_path, scan_job_id, status="completed",
                        pages_scanned=pages_done, resources_found=resources_found)
        _send_progress(progress_queue, {
            "pages_done": pages_done,
            "pages_total": max_pages,
            "current_url": "",
            "status": "completed",
        })

    except Exception as exc:
        logger.error("Crawl failed: %s", exc)
        update_scan_job(db_path, scan_job_id, status="failed", pages_scanned=pages_done)
        _send_progress(progress_queue, {
            "pages_done": pages_done,
            "pages_total": max_pages,
            "current_url": "",
            "status": "failed",
        })
        raise

    return scan_job_id
