"""Crawl engine: orchestrates worker pool + render thread + writer thread.

The engine spawns:
  - A ``ThreadPoolExecutor`` of plain-HTTP worker threads (default 8).
  - One :class:`crawler.core.render.RenderThread` for JS-rendered pages.
  - One :class:`crawler.core.writer.WriterThread` for SQLite serialization.
  - One :class:`crawler.core.progress.ProgressCoalescer` for UI back-pressure.

Workers fetch via plain HTTP, fall back to the render thread on
``needs_js_rendering()`` (or always when ``force_playwright=True``), parse,
hand the result to the writer, and push discovered links back to the
frontier.

Shutdown is **inverted** — render → executor → writer — so worker threads
blocked on a render Future see the cancellation immediately and drain fast,
the writer then flushes any remaining writes, and the engine returns within
a bounded time even when the network is hostile.
"""

import concurrent.futures
import logging
import queue
import threading
from concurrent.futures import (
    Future, ThreadPoolExecutor, FIRST_COMPLETED, TimeoutError as FuturesTimeoutError,
)
from dataclasses import dataclass
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from crawler.config import (
    MAX_DEPTH, MAX_PAGES, RENDER_TIMEOUT, REQ_PER_SEC_PER_DOMAIN,
    USER_AGENT, WORKER_COUNT, ZERO_RESOURCE_RETRY_PAGE_TYPES,
)
from crawler.core.fetcher import fetch_page, needs_js_rendering
from crawler.core.frontier import Frontier
from crawler.core.progress import ProgressCoalescer
from crawler.core.ratelimit import DomainRateLimiter
from crawler.core.render import RenderThread, ShutdownError, preflight
from crawler.core.url import normalize as _normalize_url
from crawler.core.writer import WriterThread
from crawler.models import PageWriteRequest, ScanJobUpdateRequest
from crawler.parser import parse_page
from crawler.storage import (
    create_scan_job, init_db, update_scan_job,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _check_robots(url: str, robots_cache: dict[str, RobotFileParser | None],
                  user_agent: str) -> bool:
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
            if not rp.entries:
                logger.warning(
                    "robots.txt unreadable for %s (empty/403/404), allowing all",
                    domain,
                )
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


# ---------------------------------------------------------------------------
# Worker context + per-page handler
# ---------------------------------------------------------------------------

@dataclass
class _WorkerContext:
    """Bundle of shared collaborators passed to each worker invocation."""
    scan_job_id: int
    max_pages: int
    force_playwright: bool
    frontier: Frontier
    rate_limiter: DomainRateLimiter
    render_thread: RenderThread
    writer: WriterThread
    coalescer: ProgressCoalescer
    robots_cache: dict
    robots_lock: threading.Lock
    counters: "_Counters"
    counters_lock: threading.Lock


@dataclass
class _Counters:
    pages_done: int = 0
    resources_found: int = 0


def _emit_progress(ctx: _WorkerContext, current_url: str, status: str = "running") -> None:
    ctx.coalescer.emit({
        "pages_done": ctx.counters.pages_done,
        "pages_total": ctx.max_pages,
        "current_url": current_url,
        "status": status,
    })


def _process_one_page(url: str, depth: int, ctx: _WorkerContext) -> None:
    """Worker entry point. Idempotent on per-page failures — never raises."""
    try:
        with ctx.robots_lock:
            allowed = _check_robots(url, ctx.robots_cache, USER_AGENT)
        if not allowed:
            logger.info("Blocked by robots.txt: %s", url)
            with ctx.counters_lock:
                ctx.counters.pages_done += 1
            _emit_progress(ctx, url)
            return

        ctx.rate_limiter.acquire(url)

        page_id = ctx.writer.insert_page(ctx.scan_job_id, url, depth)

        html, failure_reason = _fetch_html(ctx, url)

        if html is None:
            ctx.writer.write_page(PageWriteRequest(
                scan_job_id=ctx.scan_job_id,
                page_id=page_id,
                parse_result=None,
                page_status="failed",
                page_type="other",
                failure_reason=failure_reason or "fetch_failed",
            ))
            with ctx.counters_lock:
                ctx.counters.pages_done += 1
            _emit_progress(ctx, url)
            return

        result = parse_page(html, url)

        # R6a: list/detail page returned zero resources via plain HTTP — try
        # rendering once. Skip if force_playwright already routed through
        # the render thread.
        if (not ctx.force_playwright
                and not result.resources
                and result.page_type in ZERO_RESOURCE_RETRY_PAGE_TYPES):
            rendered_html = _try_render(ctx, url)
            if rendered_html:
                rendered_result = parse_page(rendered_html, url)
                if len(rendered_result.resources) > len(result.resources):
                    result = rendered_result

        for resource in result.resources:
            resource.url = _normalize_url(resource.url)

        ctx.writer.write_page(PageWriteRequest(
            scan_job_id=ctx.scan_job_id,
            page_id=page_id,
            parse_result=result,
            page_status="fetched",
            page_type=result.page_type,
        ))

        with ctx.counters_lock:
            ctx.counters.pages_done += 1
            ctx.counters.resources_found += len(result.resources)

        for link in result.links:
            ctx.frontier.push(link, depth + 1)

        _emit_progress(ctx, url)

    except BaseException as exc:
        logger.exception("worker crashed on %s: %s", url, exc)
        # Don't propagate — engine treats worker exceptions as page failures
        # so one bad page doesn't tear down the whole crawl.


def _fetch_html(ctx: _WorkerContext, url: str) -> tuple[str | None, str | None]:
    """Tiered fetch: plain HTTP, then Playwright fallback when needed."""
    if ctx.force_playwright:
        rendered = _try_render(ctx, url)
        if rendered is None:
            return None, "render_failed"
        return rendered, None

    html = fetch_page(url)
    if html is None:
        return None, "http_error"

    if needs_js_rendering(html):
        rendered = _try_render(ctx, url)
        if rendered is not None:
            return rendered, None
        # Fall back to the plain HTTP body — better some parse than none.

    return html, None


def _try_render(ctx: _WorkerContext, url: str) -> str | None:
    """Submit to render thread; return HTML or None on any failure."""
    try:
        future = ctx.render_thread.submit(url)
        # Use slightly less than the render-thread's own timeout so the
        # render thread's page.goto fires its TimeoutError first and the
        # Future doesn't get orphaned.
        return future.result(timeout=max(1.0, RENDER_TIMEOUT - 1))
    except (FuturesTimeoutError, ShutdownError) as exc:
        logger.warning("render of %s aborted: %s", url, exc)
    except BaseException as exc:
        logger.warning("render of %s failed: %s", url, exc)
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_crawl(
    entry_url: str,
    db_path: str,
    max_pages: int = MAX_PAGES,
    max_depth: int = MAX_DEPTH,
    req_per_sec: float = REQ_PER_SEC_PER_DOMAIN,
    workers: int = WORKER_COUNT,
    force_playwright: bool = False,
    progress_queue: queue.Queue | None = None,
    *,
    rate_limit: float | None = None,  # deprecated; preserved for callers
) -> int:
    """Run a concurrent crawl starting from ``entry_url``. Returns ``scan_job_id``.

    The legacy ``rate_limit`` kwarg is accepted but ignored — politeness is
    now enforced via the per-domain token bucket configured by
    ``req_per_sec``.
    """
    if rate_limit is not None:
        logger.debug(
            "run_crawl(rate_limit=...) is deprecated; use req_per_sec instead",
        )

    # Preflight: bail before opening the DB if Chromium is missing.
    ok, msg = preflight()
    if not ok:
        raise RuntimeError(msg)

    init_db(db_path)
    domain = urlparse(entry_url).netloc
    scan_job_id = create_scan_job(db_path, entry_url, domain, max_pages, max_depth)
    update_scan_job(db_path, scan_job_id, status="running")

    frontier = Frontier(entry_url, max_pages, max_depth)
    rate_limiter = DomainRateLimiter(req_per_sec)
    coalescer = ProgressCoalescer(progress_queue)
    coalescer.start()
    writer = WriterThread(db_path)
    writer.start()
    render_thread = RenderThread()
    render_thread.start()

    counters = _Counters()
    counters_lock = threading.Lock()
    robots_cache: dict = {}
    robots_lock = threading.Lock()

    ctx = _WorkerContext(
        scan_job_id=scan_job_id,
        max_pages=max_pages,
        force_playwright=force_playwright,
        frontier=frontier,
        rate_limiter=rate_limiter,
        render_thread=render_thread,
        writer=writer,
        coalescer=coalescer,
        robots_cache=robots_cache,
        robots_lock=robots_lock,
        counters=counters,
        counters_lock=counters_lock,
    )

    final_status = "completed"
    try:
        with ThreadPoolExecutor(max_workers=workers,
                                thread_name_prefix="crawl-w") as executor:
            in_flight: set[Future] = set()
            pages_submitted = 0

            while True:
                # Top up active workers from the frontier.
                while len(in_flight) < workers and pages_submitted < max_pages:
                    item = frontier.pop()
                    if item is None:
                        break
                    url, depth = item
                    pages_submitted += 1
                    in_flight.add(executor.submit(_process_one_page, url, depth, ctx))

                if not in_flight:
                    # Frontier empty AND no work outstanding → done.
                    if pages_submitted >= max_pages or frontier.is_done():
                        break
                    # Nothing to submit and nothing in flight; bail to avoid
                    # spinning. (Pages discovered later require an in-flight
                    # worker to have pushed them.)
                    break

                done, in_flight = concurrent.futures.wait(
                    in_flight, timeout=0.5, return_when=FIRST_COMPLETED,
                )
                for fut in done:
                    _drain_future(fut)

            # Drain any stragglers.
            for fut in concurrent.futures.as_completed(in_flight, timeout=60.0):
                _drain_future(fut)

    except BaseException as exc:
        logger.exception("Crawl orchestration failed: %s", exc)
        final_status = "failed"
        raise
    finally:
        # Inverted shutdown: render first so blocked workers see exceptions
        # immediately, then the executor (already exited via context manager
        # above on the happy path; redundant here on error), then the writer
        # so any pending PageWriteRequests flush before we close the DB.
        try:
            render_thread.shutdown(timeout=10.0)
        except Exception:
            logger.exception("RenderThread shutdown raised")

        try:
            writer.update_scan_job(ScanJobUpdateRequest(
                scan_job_id=scan_job_id,
                status=final_status,
                pages_scanned=counters.pages_done,
                resources_found=counters.resources_found,
            ))
        except Exception:
            logger.exception("Final scan_job update raised")

        try:
            writer.shutdown(timeout=10.0)
        except Exception:
            logger.exception("WriterThread shutdown raised")

        coalescer.emit({
            "pages_done": counters.pages_done,
            "pages_total": max_pages,
            "current_url": "",
            "status": final_status,
        })
        try:
            coalescer.shutdown(timeout=2.0)
        except Exception:
            logger.exception("ProgressCoalescer shutdown raised")

    return scan_job_id


def _drain_future(fut: Future) -> None:
    try:
        fut.result()
    except BaseException as exc:
        logger.warning("worker future raised: %s", exc, exc_info=False)
