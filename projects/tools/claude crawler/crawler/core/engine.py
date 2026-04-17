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
import contextlib
import logging
import queue
import sqlite3
import threading
from concurrent.futures import (
    Future, ThreadPoolExecutor, FIRST_COMPLETED, TimeoutError as FuturesTimeoutError,
)
from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from crawler.config import (
    MAX_DEPTH, MAX_PAGES, RENDER_TIMEOUT, REQ_PER_SEC_PER_DOMAIN,
    USER_AGENT, WORKER_COUNT, WRITER_REPLY_TIMEOUT,
    ZERO_RESOURCE_RETRY_PAGE_TYPES,
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
    create_scan_job, get_all_page_urls, get_pending_pages,
    get_scan_job_by_entry_url, init_db, update_scan_job,
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
    # B3: latch ensures the "render disabled" UI warning fires exactly once
    # per scan, not once per page that hits the disabled path.
    render_disabled_warned: threading.Event = field(
        default_factory=threading.Event,
    )


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


def _write_success_and_count(ctx: _WorkerContext, request: PageWriteRequest) -> None:
    """Success-path write: await the writer's commit ack and only increment
    counters on confirmed commit (B1 counter coherence).

    On any failure (rollback, WriterUnavailableError, reply timeout) the
    page row stays in its current DB state and counters are NOT
    incremented — resume picks up the row's `pending` status next run.

    Resources count is derived from ``request.parse_result`` so callers
    can't drift it out of sync with the actual write payload.
    """
    assert request.reply is None, "_write_success_and_count owns the reply Future"
    request.reply = Future()
    try:
        ctx.writer.write_page(request)
        request.reply.result(timeout=WRITER_REPLY_TIMEOUT)
    except BaseException as exc:
        logger.warning(
            "write_page failed for page_id=%s: %s — counters not incremented",
            request.page_id, exc,
        )
        return
    added = (
        len(request.parse_result.resources)
        if request.parse_result is not None
        else 0
    )
    with ctx.counters_lock:
        ctx.counters.pages_done += 1
        ctx.counters.resources_found += added


def _write_failure_and_count(ctx: _WorkerContext, request: PageWriteRequest) -> None:
    """Failure-path write: fire-and-forget. The page row will be set to
    'failed' (or stay 'pending' if write fails — resume retries either way),
    counters increment immediately because:

      1. Failure rows have no resources to count, so counter coherence is
         trivially preserved (no resources_found drift possible).
      2. The pages_done bump is one-per-page regardless of write outcome
         — even if the failed-row write itself fails, the URL is no longer
         a candidate for further work in this run.
      3. Failure paths are common on hostile sites (high robots-block /
         404 rate). Routing them through a 10s reply-await would block
         workers under writer pressure on no-op writes.

    On WriterUnavailableError the engine's wait-loop health check fires
    within 0.5s and aborts the run cleanly.
    """
    try:
        ctx.writer.write_page(request)
    except Exception as exc:
        logger.warning("failed-page write_page raised: %s", exc)
        # Engine health check will detect persistent writer issues; for a
        # transient error the page just stays 'pending' for resume.
    with ctx.counters_lock:
        ctx.counters.pages_done += 1


def _process_one_page(url: str, depth: int, page_id: int,
                      ctx: _WorkerContext) -> None:
    """Worker entry point. Idempotent on per-page failures — never raises."""
    try:
        with ctx.robots_lock:
            allowed = _check_robots(url, ctx.robots_cache, USER_AGENT)
        if not allowed:
            logger.info("Blocked by robots.txt: %s", url)
            _write_failure_and_count(ctx, PageWriteRequest(
                scan_job_id=ctx.scan_job_id,
                page_id=page_id,
                parse_result=None,
                page_status="failed",
                page_type="other",
                failure_reason="robots_blocked",
            ))
            _emit_progress(ctx, url)
            return

        ctx.rate_limiter.acquire(url)

        html, failure_reason = _fetch_html(ctx, url)

        if html is None:
            _write_failure_and_count(ctx, PageWriteRequest(
                scan_job_id=ctx.scan_job_id,
                page_id=page_id,
                parse_result=None,
                page_status="failed",
                page_type="other",
                failure_reason=failure_reason or "fetch_failed",
            ))
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

        # B1: counter coherence via reply Future — only incremented on
        # confirmed commit. _write_success_and_count derives resources_added
        # from request.parse_result so callers can't drift it.
        _write_success_and_count(ctx, PageWriteRequest(
            scan_job_id=ctx.scan_job_id,
            page_id=page_id,
            parse_result=result,
            page_status="fetched",
            page_type=result.page_type,
        ))

        # Stage discovered links under Frontier's lock (microsecond critical
        # section), then flush the whole batch via one writer round-trip
        # outside the lock. A failed push (e.g., normalization edge case) is
        # logged and skipped so a single bad link doesn't poison the rest.
        for link in result.links:
            try:
                ctx.frontier.push(link, depth + 1)
            except Exception as exc:
                logger.warning("frontier.push failed for %s: %s", link, exc)
        try:
            ctx.frontier.flush_batch()
        except Exception as exc:
            logger.warning(
                "frontier.flush_batch failed for page %s: %s", url, exc,
            )

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
    """Submit to render thread; return HTML or None on any failure.

    B3: short-circuits if the render thread has disabled itself (crash
    circuit breaker tripped). Emits a one-time UI warning event so the
    user sees that JS rendering stopped working rather than every JS page
    silently turning into a failed page.
    """
    if ctx.render_thread.is_disabled():
        # Racy by design: two workers may both fire the warning before either
        # set()s. ProgressCoalescer dedupes adjacent emits, so a Lock isn't
        # worth it — invariant is "user sees the warning at least once".
        if not ctx.render_disabled_warned.is_set():
            ctx.render_disabled_warned.set()
            ctx.coalescer.emit({
                "pages_done": ctx.counters.pages_done,
                "pages_total": ctx.max_pages,
                "current_url": url,
                "status": "running",
                "warning": "render_disabled",
            })
        return None
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
    normalized_entry = _normalize_url(entry_url)

    # Resume detection: if a scan_job exists for this entry URL with pending
    # pages still in the table, reuse it. If the previous run completed (or
    # has no pending work), short-circuit and return its id without spawning
    # the thread pool — re-clicking Start should be a no-op.
    existing_job = get_scan_job_by_entry_url(db_path, entry_url)
    resume_mode = False
    if existing_job is not None:
        pending_rows = get_pending_pages(db_path, existing_job.id)
        if not pending_rows:
            logger.info(
                "Scan for %s has no pending pages (status=%s); reusing job %d as-is",
                entry_url, existing_job.status, existing_job.id,
            )
            return existing_job.id
        scan_job_id = existing_job.id
        resume_mode = True
        update_scan_job(db_path, scan_job_id, status="running")
        logger.info("Resuming scan job %d with %d pending pages",
                    scan_job_id, len(pending_rows))
    else:
        scan_job_id = create_scan_job(
            db_path, entry_url, domain, max_pages, max_depth,
        )
        update_scan_job(db_path, scan_job_id, status="running")
        pending_rows = []

    rate_limiter = DomainRateLimiter(req_per_sec)
    coalescer = ProgressCoalescer(progress_queue)
    coalescer.start()
    writer = WriterThread(db_path)
    writer.start()
    render_thread = RenderThread()
    render_thread.start()

    # Frontier construction must come *after* writer.start() because the
    # writer-aware mode calls writer.insert_page synchronously via Future.
    #
    # Discovery cap is intentionally *higher* than the per-run max_pages
    # processing cap. Per Unit 8, links beyond the processing budget should
    # still get persisted as `pages.status='pending'` so the next run can
    # resume from them. The 10x multiplier (with floor 10k) gives generous
    # headroom while still bounding pathological frontiers.
    discovery_cap = max(max_pages * 10, 10_000)
    if resume_mode:
        frontier = Frontier(
            entry_url, discovery_cap, max_depth,
            writer=writer, scan_job_id=scan_job_id, auto_seed=False,
        )
        frontier.mark_visited(get_all_page_urls(db_path, scan_job_id))
        frontier.seed_existing(pending_rows)
    else:
        frontier = Frontier(
            entry_url, discovery_cap, max_depth,
            writer=writer, scan_job_id=scan_job_id,
        )

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

    # Build executor explicitly (not via `with`) so we control the order in
    # which it is shut down relative to render/writer. The `with` form would
    # call executor.shutdown(wait=True) on context exit BEFORE our finally
    # block runs, which is what made the documented "inverted shutdown"
    # actually executor-first.
    executor = ThreadPoolExecutor(
        max_workers=workers, thread_name_prefix="crawl-w",
    )
    final_status = "completed"
    in_flight: set[Future] = set()
    try:
        pages_submitted = 0

        while True:
            # Top up active workers from the frontier.
            while len(in_flight) < workers and pages_submitted < max_pages:
                item = frontier.pop()
                if item is None:
                    break
                url, depth, page_id = item
                pages_submitted += 1
                in_flight.add(executor.submit(
                    _process_one_page, url, depth, page_id, ctx,
                ))

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

            # A6: health check between waits. If the writer thread died or
            # raised a fatal error, abort fast — every subsequent worker
            # write would fail anyway, and we'd otherwise silently report
            # success while the DB diverged from our in-memory counters.
            if not writer.is_alive() or writer.last_exception is not None:
                logger.error(
                    "Writer thread is no longer healthy "
                    "(alive=%s, last_exception=%r); aborting scan",
                    writer.is_alive(), writer.last_exception,
                )
                final_status = "failed"
                break

    except BaseException as exc:
        logger.exception("Crawl orchestration failed: %s", exc)
        final_status = "failed"
        raise
    finally:
        # Truly inverted shutdown: render first so workers blocked on render
        # Futures see exceptions immediately and don't wait their full
        # RENDER_TIMEOUT inside the executor. Then cancel-pending the
        # executor so queued worker tasks never start. Then drain any
        # in-flight workers with a bounded timeout (the watchdog from A4
        # backstops render-side hangs). Then writer terminal update + writer
        # shutdown, then coalescer.
        try:
            render_thread.shutdown(timeout=5.0)
        except Exception:
            logger.exception("RenderThread shutdown raised")

        executor.shutdown(wait=False, cancel_futures=True)

        if in_flight:
            done, still_running = concurrent.futures.wait(in_flight, timeout=5.0)
            for fut in done:
                _drain_future(fut)
            if still_running:
                logger.warning(
                    "%d worker future(s) did not complete within 5s drain",
                    len(still_running),
                )

        # Snapshot counters under lock so the terminal update sees a single
        # consistent point-in-time value rather than racing with stragglers.
        with counters_lock:
            final_pages_done = counters.pages_done
            final_resources_found = counters.resources_found

        # A6: terminal scan_job update via writer if alive; otherwise direct
        # connection bypass so the scan_jobs row doesn't stay 'running'
        # forever after a writer crash. WriterUnavailableError is a subclass
        # of Exception, so the broad catch handles both expected (writer
        # dead) and unexpected failures uniformly.
        terminal_written = False
        if writer.is_alive():
            try:
                writer.update_scan_job(ScanJobUpdateRequest(
                    scan_job_id=scan_job_id,
                    status=final_status,
                    pages_scanned=final_pages_done,
                    resources_found=final_resources_found,
                ))
                terminal_written = True
            except Exception:
                logger.exception("Final scan_job update via writer failed")

        try:
            writer.shutdown(timeout=5.0)
        except Exception:
            logger.exception("WriterThread shutdown raised")

        if not terminal_written:
            # Writer was already dead or failed mid-update. Use a fresh
            # direct connection — safe because the writer is provably gone.
            _direct_finalize_scan_job(
                db_path, scan_job_id, final_status,
                final_pages_done, final_resources_found,
            )

        coalescer.emit({
            "pages_done": final_pages_done,
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


def _direct_finalize_scan_job(db_path: str, scan_job_id: int, status: str,
                              pages_scanned: int, resources_found: int) -> None:
    """Bypass-the-writer fallback to set scan_jobs terminal state when the
    writer thread is dead. Safe because the writer is the only contender
    for write locks and it's no longer running.

    Uses ``contextlib.closing`` to guarantee the new connection is closed —
    sqlite3.Connection's own context manager only manages the transaction.
    """
    try:
        with contextlib.closing(
            sqlite3.connect(db_path, timeout=5.0)
        ) as conn:
            conn.execute("PRAGMA busy_timeout=5000")
            with conn:  # transaction context — commits on success
                conn.execute(
                    "UPDATE scan_jobs SET status = ?, pages_scanned = ?, "
                    "resources_found = ?, completed_at = CURRENT_TIMESTAMP "
                    "WHERE id = ?",
                    (status, pages_scanned, resources_found, scan_job_id),
                )
        logger.warning(
            "Scan_job %d finalized via direct DB connection (writer was dead)",
            scan_job_id,
        )
    except Exception:
        logger.exception(
            "Direct finalize of scan_job %d failed; row may remain in "
            "'running' state", scan_job_id,
        )
