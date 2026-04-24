from __future__ import annotations

import concurrent.futures
import logging
import sqlite3
import threading
import time
from collections import OrderedDict, deque
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from crawler.cache import CacheService
from crawler.config import (
    MAX_PAGES,
    RENDER_TIMEOUT,
    WORKER_COUNT,
    ZERO_RESOURCE_RETRY_PAGE_TYPES,
)
from crawler.core.fetcher import fetch_page_with_cache_tracking, needs_js_rendering as should_render
from crawler.core.frontier import Frontier
from crawler.core.frontier_base import BaseFrontier
from crawler.core.monitoring import get_event_logger, EventType
from crawler.core.progress import ProgressCoalescer
from crawler.core.ratelimit import DomainRateLimiter
from crawler.core.render import RenderThread, preflight
from crawler.core.writer import PageWriteRequest, WriterThread, WriterUnavailableError
from crawler.exceptions import NetworkError
from crawler.models import Resource, ParseResult
from crawler.parser import parse_page
from crawler.storage import (
    create_scan_job,
    get_connection,
    get_scan_job,
    get_scan_job_by_entry_url,
    init_db,
    update_scan_job,
)
from crawler.repository import DatabaseRepository

logger = logging.getLogger(__name__)

# Global tracker to avoid duplicate concurrent asset downloads
_DOWNLOADING_ASSETS = set()
_ASSET_LOCK = threading.Lock()


@dataclass
class _Counters:
    pages_done: int = 0
    resources_found: int = 0
    activity_log: deque = field(default_factory=lambda: deque(maxlen=50))


@dataclass
class _WorkerContext:
    scan_job_id: int
    max_pages: int
    force_playwright: bool
    frontier: BaseFrontier
    rate_limiter: DomainRateLimiter
    render_thread: RenderThread
    writer: WriterThread
    coalescer: ProgressCoalescer
    counters: _Counters
    counters_lock: threading.Lock
    cache_service: CacheService
    repo: DatabaseRepository = field(default=None)
    render_warning_sent: threading.Event = field(default_factory=threading.Event)
    asset_executor: ThreadPoolExecutor = field(default_factory=lambda: ThreadPoolExecutor(max_workers=4))


def _check_robots(url, cache, user_agent="*"):
    parsed = urlparse(url)
    hostname = parsed.hostname
    if hostname in cache:
        rp = cache[hostname]
        return rp.can_fetch(user_agent, url) if rp else True

    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
    except Exception:
        cache[hostname] = None
        return True

    if not rp.entries:
        cache[hostname] = None
        return True

    cache[hostname] = rp
    return rp.can_fetch(user_agent, url)


def _process_one_page(url, depth, page_id, ctx):
    start_time = time.perf_counter()
    try:
        ctx.rate_limiter.acquire(url)
        
        # R9: Check if rendering is disabled
        if ctx.render_thread.is_disabled():
            if not ctx.render_warning_sent.is_set():
                ctx.render_warning_sent.set()
                logger.error("JS Rendering is disabled due to repeated crashes.")
                if ctx.coalescer:
                    ctx.coalescer.emit({
                        "job_id": ctx.scan_job_id,
                        "status": "running",
                        "warning": "JS rendering disabled (Chromium crash loop)",
                        "pages_done": ctx.counters.pages_done,
                        "resources_found": ctx.counters.resources_found,
                    })

        html = None
        failure_reason = None
        use_render = ctx.force_playwright and not ctx.render_thread.is_disabled()
        
        if not use_render:
            html, failure_reason = _fetch_html(ctx, url)
            if html and not ctx.render_thread.is_disabled():
                use_render = should_render(html)

        if use_render:
            try:
                render_res = ctx.render_thread.submit(url).result(timeout=RENDER_TIMEOUT + 5)
                if render_res:
                    html = render_res.html if hasattr(render_res, "html") else render_res
                    failure_reason = None
            except Exception as e:
                logger.warning(f"Render failed for {url}: {e}")
                if not html:
                    failure_reason = "render_failed"

        if html is None:
            reply_f = Future()
            ctx.writer.write_page(
                PageWriteRequest(
                    ctx.scan_job_id,
                    page_id,
                    None,
                    "failed",
                    failure_reason=failure_reason or "fetch_failed",
                    reply=reply_f,
                )
            )
            try:
                reply_f.result(timeout=10.0)
                with ctx.counters_lock:
                    ctx.counters.pages_done += 1
            except Exception: pass
            return

        result = parse_page(html, url, source="rendered" if use_render else "static")
        
        # B6/R16: R6a fallback
        if not use_render and not ctx.render_thread.is_disabled() and result.page_type in ZERO_RESOURCE_RETRY_PAGE_TYPES and not result.resources:
            try:
                render_res = ctx.render_thread.submit(url).result(timeout=RENDER_TIMEOUT)
                if render_res:
                    rendered_html = render_res.html if hasattr(render_res, "html") else render_res
                    result = parse_page(rendered_html, url, source="rendered_fallback")
                    use_render = True
            except Exception:
                pass

        # R7: Counter coherence
        reply_f = Future()
        ctx.writer.write_page(
            PageWriteRequest(
                ctx.scan_job_id, page_id, result, "fetched", result.page_type, reply=reply_f
            )
        )

        try:
            reply_f.result(timeout=10.0)
            with ctx.counters_lock:
                ctx.counters.pages_done += 1
                ctx.counters.resources_found += len(result.resources)
                ctx.counters.activity_log.append(f"Parsed ({'JS' if use_render else 'Static'}): {url}")
        except Exception: pass

        for link in result.links:
            ctx.frontier.push(link, depth + 1)
        ctx.frontier.flush_batch()
        
        # Phase 4 Unit F2: Background Asset Archival
        for res in result.resources:
            if res.cover_url:
                ctx.asset_executor.submit(_archive_asset, res, ctx.scan_job_id)
        
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        _emit_progress(ctx, url, latency_ms=duration_ms)
    except:
        logger.exception("Worker crash")


def _archive_asset(res: Resource, job_id: int):
    """Background helper to download and link local assets."""
    from crawler.core.fetcher import download_asset
    import hashlib
    import os
    
    with _ASSET_LOCK:
        if res.cover_url in _DOWNLOADING_ASSETS: return
        _DOWNLOADING_ASSETS.add(res.cover_url)
    
    try:
        ext = os.path.splitext(res.cover_url.split('?')[0])[1] or ".jpg"
        filename = hashlib.md5(res.cover_url.encode()).hexdigest() + ext
        save_path = f"data/assets/{job_id}/{filename}"
        
        if os.path.exists(save_path): return

        if download_asset(res.cover_url, save_path):
            pass
    finally:
        with _ASSET_LOCK:
            _DOWNLOADING_ASSETS.remove(res.cover_url)


def _fetch_html(ctx, url):
    try:
        h, cached = fetch_page_with_cache_tracking(url, ctx.cache_service)
        return h, None
    except NetworkError as e:
        return None, e.failure_reason


def _emit_progress(ctx, url, status="running", latency_ms=0):
    if ctx.coalescer:
        with ctx.counters_lock:
            ctx.coalescer.emit({
                "job_id": ctx.scan_job_id,
                "status": status,
                "pages_done": ctx.counters.pages_done,
                "resources_found": ctx.counters.resources_found,
                "current_url": url,
                "latency_ms": latency_ms
            })


def _direct_finalize_scan_job(
    db_path, scan_job_id, status, pages_scanned, resources_found
):
    """Fallback finalize for when the WriterThread is dead."""
    try:
        with get_connection(db_path, write=True) as conn:
            conn.execute(
                "UPDATE scan_jobs SET status=?, pages_scanned=?, resources_found=?, completed_at=CURRENT_TIMESTAMP WHERE id=?",
                (status, pages_scanned, resources_found, scan_job_id),
            )
    except Exception:
        logger.exception(f"Failed direct finalize for job {scan_job_id}")


def _get_frontier(entry_url, max_pages, writer, scan_job_id, auto_seed):
    from crawler.config import REDIS_URL
    if REDIS_URL:
        try:
            from crawler.core.redis_frontier import RedisFrontier
            f = RedisFrontier(
                entry_url, max(max_pages * 10, 10000), 3, 
                writer=writer, scan_job_id=scan_job_id, redis_url=REDIS_URL, auto_seed=auto_seed
            )
            logger.info("Distributed Frontier active.")
            return f
        except Exception as e:
            logger.error(f"Redis failed ({e}). Falling back to LocalFrontier.")
            
    return Frontier(
        entry_url, max(max_pages * 10, 10000), 3, 
        writer=writer, scan_job_id=scan_job_id, auto_seed=auto_seed
    )


def run_crawl(
    entry_url,
    db_path,
    max_pages=MAX_PAGES,
    workers=WORKER_COUNT,
    scan_job_id=None,
    progress_queue=None,
    **kwargs,
):
    init_db(db_path)
    repo = DatabaseRepository(db_path)

    if scan_job_id is None:
        existing = get_scan_job_by_entry_url(db_path, entry_url)
        if existing: scan_job_id = existing.id
        else: scan_job_id = create_scan_job(db_path, entry_url, urlparse(entry_url).netloc, max_pages, 3)

    update_scan_job(db_path, scan_job_id, status="running")

    # A1/A2: Preflight
    ok, reason = preflight()
    if not ok:
        update_scan_job(db_path, scan_job_id, status="failed")
        raise RuntimeError(reason)

    writer = WriterThread(db_path)
    writer.start()
    render_thread = RenderThread()
    render_thread.start()
    coalescer = ProgressCoalescer(progress_queue)

    # R33: Robust State Recovery
    try:
        with get_connection(db_path) as conn:
            rows = conn.execute("SELECT url, depth, id, status FROM pages WHERE scan_job_id=?", (scan_job_id,)).fetchall()
            entry_in_db = any(r["url"] == entry_url for r in rows)
            frontier = _get_frontier(entry_url, max_pages, writer, scan_job_id, auto_seed=(not entry_in_db))
            
            pending_rows = [(r["url"], r["depth"], r["id"]) for r in rows if r["status"] == "pending"]
            visited_urls = [r["url"] for r in rows if r["status"] != "pending"]
            frontier.mark_visited(visited_urls)
            frontier.seed_existing(pending_rows)
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
        update_scan_job(db_path, scan_job_id, status="failed")
        writer.shutdown(); render_thread.shutdown(); return scan_job_id

    ctx = _WorkerContext(
        scan_job_id=scan_job_id,
        max_pages=max_pages,
        force_playwright=kwargs.get("force_playwright", False),
        frontier=frontier,
        repo=repo,
        rate_limiter=DomainRateLimiter(kwargs.get("req_per_sec", 2.0)),
        render_thread=render_thread,
        writer=writer,
        coalescer=coalescer,
        counters=_Counters(),
        counters_lock=threading.Lock(),
        cache_service=CacheService(db_path),
    )

    executor = ThreadPoolExecutor(max_workers=workers)
    in_flight, submitted = set(), 0
    get_event_logger().log_event(EventType.SCAN_STARTED, url=entry_url)
    
    time.sleep(0.5) # Wait for async seeding

    try:
        while True:
            while len(in_flight) < workers and submitted < max_pages:
                item = frontier.pop()
                if not item: break
                u, d, pid = item
                in_flight.add(executor.submit(_process_one_page, u, d, pid, ctx))
                submitted += 1

            if not in_flight:
                if submitted >= max_pages:
                    break
                time.sleep(0.5) 
                item = frontier.pop()
                if not item: break
                u, d, pid = item
                in_flight.add(executor.submit(_process_one_page, u, d, pid, ctx))
                submitted += 1
                continue

            done, in_flight = concurrent.futures.wait(in_flight, timeout=0.1, return_when=FIRST_COMPLETED)
            if not writer.is_alive() or (hasattr(writer, "last_exception") and writer.last_exception):
                break
    finally:
        render_thread.shutdown(timeout=5.0)
        executor.shutdown(wait=False, cancel_futures=True)
        if in_flight: concurrent.futures.wait(in_flight, timeout=2.0)

        if not writer.is_alive():
            _direct_finalize_scan_job(db_path, scan_job_id, "failed", ctx.counters.pages_done, ctx.counters.resources_found)
            _emit_progress(ctx, entry_url, status="failed")
        else:
            update_scan_job(db_path, scan_job_id, status="completed")
            _emit_progress(ctx, entry_url, status="completed")

        writer.shutdown(timeout=5.0)
        if coalescer: coalescer.shutdown()
        ctx.asset_executor.shutdown(wait=False)

    return scan_job_id
