"""Streamlit Web UI for Claude Crawler."""

import queue
import re
import sqlite3
import threading
import time
from urllib.parse import urlparse, urlunparse

import streamlit as st

from crawler import config, storage, analysis, export
from crawler.cache import CacheService
from crawler.core.engine import run_crawl
from crawler.core.url import is_private_host


# Matches inputs that LOOK like 'scheme:rest' but aren't a real URL with
# '://'. Used to reject pseudo-schemes (javascript:, mailto:, tel:, data:)
# BEFORE the no-scheme branch prepends 'https://' to them.
_PSEUDO_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+\-.]*:(?!//)")


def _normalize_entry_url(raw: str | None) -> str | None:
    """Coerce common user inputs into a valid http(s) URL.

    Accepts forms like ``example.com``, ``example.com/path``, ``//example.com``,
    or full URLs. Returns ``None`` if the input cannot be salvaged into a
    URL with a host component, or if it carries a pseudo-scheme like
    ``javascript:``, ``mailto:``, ``tel:``, or ``data:``.
    """
    raw = (raw or "").strip()
    if not raw:
        return None
    candidate = raw
    if candidate.startswith("//"):
        # Protocol-relative URL (//host/path) — common when copy-pasting
        # from rendered pages.
        candidate = "https:" + candidate
    elif "://" not in candidate:
        # Reject pseudo-schemes BEFORE prepending https:// — without this
        # check, 'javascript:alert(1)' becomes 'https://javascript:alert(1)'
        # and silently passes the http(s) allowlist below.
        if _PSEUDO_SCHEME_RE.match(candidate):
            return None
        candidate = "https://" + candidate
    parsed = urlparse(candidate)
    if not parsed.scheme or not parsed.netloc:
        return None
    if parsed.scheme.lower() not in ("http", "https"):
        return None
    # Reject hosts containing whitespace — urlparse accepts them but
    # downstream HTTP fetch will fail with confusing DNS errors.
    if any(c.isspace() for c in parsed.netloc):
        return None
    # SSRF gate: reject private/loopback/link-local hosts unless the
    # operator explicitly allows them (local dev). hostname strips port
    # if any; brackets get stripped inside is_private_host.
    if not config.ALLOW_PRIVATE_HOSTS and is_private_host(parsed.hostname):
        return None
    # Return the canonical reassembly so display matches what the engine
    # actually crawls (lowercase scheme, normalized form).
    return urlunparse(parsed._replace(scheme=parsed.scheme.lower()))


def main():
    st.set_page_config(page_title="Claude Crawler", page_icon="🔍", layout="wide")
    st.title("Website Resource Scanner & Tag Analyzer")

    # Initialize DB
    db_path = config.DB_PATH
    storage.init_db(db_path)

    # Initialize session state
    if "scan_running" not in st.session_state:
        st.session_state.scan_running = False
    if "scan_job_id" not in st.session_state:
        st.session_state.scan_job_id = None
    if "progress" not in st.session_state:
        st.session_state.progress = None
    if "scan_started_at" not in st.session_state:
        st.session_state.scan_started_at = None

    # --- Sidebar: Scan Control ---
    render_sidebar(db_path)

    # --- Main Content ---
    if st.session_state.scan_running:
        render_progress()
    elif st.session_state.scan_job_id:
        render_results(db_path, st.session_state.scan_job_id)
    else:
        # Show previous scans or welcome message
        render_history(db_path)


def render_sidebar(db_path: str):
    with st.sidebar:
        st.header("Scan Configuration")
        url = st.text_input("Target URL", placeholder="https://example.com")
        max_pages = st.slider("Max Pages", 10, 1000, config.MAX_PAGES)
        max_depth = st.slider("Max Depth", 1, 5, config.MAX_DEPTH)

        st.subheader("Performance")
        workers = st.slider(
            "Workers", 1, 16, config.WORKER_COUNT,
            help="Concurrent HTTP fetchers. Higher = faster scans on multi-domain "
                 "or low-latency targets.",
        )
        req_per_sec = st.slider(
            "Requests/sec per domain",
            float(config.REQ_PER_SEC_MIN),
            float(config.REQ_PER_SEC_MAX),
            float(config.REQ_PER_SEC_PER_DOMAIN),
            0.5,
            help="Politeness cap. Token bucket — same domain serializes at this "
                 "rate even with many workers.",
        )
        force_playwright = st.checkbox(
            "Force Playwright for all pages",
            value=False,
            help="Skip plain HTTP and route every URL through Chromium. Use when "
                 "you know the target site needs JS rendering.",
        )

        st.subheader("Cache Management")
        cache_service = CacheService(db_path)
        metrics = cache_service.get_metrics()
        col_hits, col_misses = st.columns(2)
        with col_hits:
            st.metric("Cached Responses", metrics["entry_count"])
        with col_misses:
            cache_size_mb = metrics["total_bytes"] / (1024 * 1024)
            st.metric("Cache Size (MB)", f"{cache_size_mb:.2f}")

        if st.button("🗑️ Clear HTTP Cache", key="btn_clear_cache",
                    use_container_width=True,
                    help="Remove all cached HTTP responses. Does not affect scan results."):
            cache_service.invalidate_all()
            st.success("Cache cleared!")
            st.rerun()

        if st.button("Start Scan", disabled=st.session_state.scan_running,
                     type="primary"):
            normalized = _normalize_entry_url(url)
            if normalized is None:
                st.error(
                    "Invalid URL. Use a full address like "
                    "`https://example.com/`. Bare hostnames like "
                    "`example.com` are auto-normalized."
                )
                return
            if normalized != url.strip():
                st.info(f"Normalized URL → {normalized}")
            start_scan(db_path, normalized, max_pages, max_depth,
                       workers=workers, req_per_sec=req_per_sec,
                       force_playwright=force_playwright)

        # History selector
        st.divider()
        st.header("History")
        jobs = storage.list_scan_jobs(db_path)
        if jobs:
            options = {
                f"#{j.id} {j.domain} ({j.status}, {j.resources_found}r)": j.id
                for j in jobs
            }
            selected = st.selectbox(
                "Previous Scans", list(options.keys()),
                key="sidebar_history_select",
            )
            selected_id = options[selected]
            col_load, col_del = st.columns(2)
            with col_load:
                if st.button("Load", key="sidebar_btn_load",
                             use_container_width=True):
                    st.session_state.scan_job_id = selected_id
                    st.session_state.scan_running = False
                    st.session_state.pop("pending_delete_id", None)
                    st.rerun()
            with col_del:
                # Block delete of the *currently running* scan: the live
                # WriterThread is still INSERTing pages/resources for that
                # scan_job_id, and tearing the parent row out from under
                # it triggers an FK violation that crashes the writer.
                is_running_target = (
                    st.session_state.get("scan_running")
                    and st.session_state.get("scan_job_id") == selected_id
                )
                if st.button("Delete", key="sidebar_btn_delete",
                             disabled=is_running_target,
                             help=("Stop the running scan before deleting it"
                                   if is_running_target else None),
                             use_container_width=True):
                    st.session_state.pending_delete_id = selected_id
            if st.session_state.get("pending_delete_id") == selected_id:
                st.warning(f"Delete scan #{selected_id}? This cannot be undone.")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("Confirm delete", type="primary",
                                 key="sidebar_btn_confirm_delete",
                                 use_container_width=True):
                        # Pop FIRST so a double-click finds the sentinel gone
                        # and skips the second DELETE.
                        if st.session_state.pop(
                            "pending_delete_id", None,
                        ) == selected_id:
                            storage.delete_scan_job(db_path, selected_id)
                            if st.session_state.get("scan_job_id") == selected_id:
                                st.session_state.scan_job_id = None
                            # Reset the selectbox so the just-deleted ID
                            # doesn't linger as the highlighted option.
                            st.session_state.pop("sidebar_history_select", None)
                            st.rerun()
                with c2:
                    if st.button("Cancel", key="sidebar_btn_cancel_delete",
                                 use_container_width=True):
                        st.session_state.pop("pending_delete_id", None)
                        st.rerun()


def start_scan(db_path: str, url: str, max_pages: int, max_depth: int,
               *, workers: int, req_per_sec: float, force_playwright: bool):
    progress_queue = queue.Queue()
    st.session_state.scan_running = True
    st.session_state.progress = {
        "pages_done": 0, "pages_total": max_pages,
        "current_url": url, "status": "starting",
    }
    st.session_state._progress_queue = progress_queue
    st.session_state.scan_started_at = time.monotonic()

    def worker():
        try:
            job_id = run_crawl(
                url, db_path,
                max_pages=max_pages, max_depth=max_depth,
                req_per_sec=req_per_sec, workers=workers,
                force_playwright=force_playwright,
                progress_queue=progress_queue,
            )
            # Compute scores after crawl
            analysis.compute_scores(db_path, job_id)
            progress_queue.put({"status": "completed", "scan_job_id": job_id})
        except RuntimeError as exc:
            # Preflight failures (Playwright/Chromium missing) surface here
            # with a remediation message embedded in the error.
            progress_queue.put({
                "status": "failed",
                "error": str(exc),
                "remediation": (
                    "playwright install chromium" in str(exc)
                ),
            })
        except Exception as exc:
            progress_queue.put({"status": "failed", "error": str(exc)})

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    st.rerun()


def render_progress():
    st.subheader("Scanning in progress...")

    progress_queue = st.session_state.get("_progress_queue")
    if progress_queue:
        # Drain all available progress updates — coalescer already throttles
        # to ~4 events/sec, so the loop is bounded.
        while True:
            try:
                update = progress_queue.get_nowait()
                st.session_state.progress = update
            except queue.Empty:
                break

    prog = st.session_state.progress or {}
    status = prog.get("status", "unknown")

    if status == "completed":
        st.session_state.scan_running = False
        st.session_state.scan_job_id = prog.get("scan_job_id")
        st.success("Scan completed!")
        time.sleep(0.5)
        st.rerun()
        return
    elif status == "failed":
        st.session_state.scan_running = False
        error_msg = prog.get("error", "Unknown error")
        if prog.get("remediation"):
            st.error("Playwright Chromium is not installed.")
            st.code("playwright install chromium", language="bash")
            st.caption(error_msg)
        else:
            st.error(f"Scan failed: {error_msg}")
        return

    pages_done = prog.get("pages_done", 0)
    pages_total = prog.get("pages_total", 1)
    current_url = prog.get("current_url", "")
    warning = prog.get("warning")
    if warning == "render_disabled":
        st.warning(
            "JS rendering disabled — Chromium failed repeatedly. "
            "Remaining JS-rendered pages will be marked failed. "
            "Check `playwright install chromium` and the application logs."
        )

    started = st.session_state.get("scan_started_at")
    elapsed = time.monotonic() - started if started else 0

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Pages Scanned", pages_done)
    with col2:
        st.metric("Target", pages_total)
    with col3:
        st.metric("Elapsed", f"{int(elapsed)}s")

    st.progress(min(pages_done / max(pages_total, 1), 1.0))
    st.caption(f"Current: {current_url}")

    # Auto-refresh while scanning
    time.sleep(1)
    st.rerun()


def render_results(db_path: str, scan_job_id: int):
    job = storage.get_scan_job(db_path, scan_job_id)
    if not job:
        st.error("Scan job not found")
        return

    st.subheader(f"Results: {job.domain}")
    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("Pages Scanned", job.pages_scanned)
    with col2:
        st.metric("Resources Found", job.resources_found)
    with col3:
        overview = analysis.get_tag_overview(db_path, scan_job_id)
        st.metric("Tags Found", overview["total_tags"])
    with col4:
        st.metric("Cache Hits", job.cache_hits)
    with col5:
        st.metric("Cache Misses", job.cache_misses)

    tab1, tab2, tab3 = st.tabs([
        "📊 Hot Resources", "🏷️ Tag Analysis", "⚠️ Failed Pages",
    ])

    with tab1:
        render_rankings(db_path, scan_job_id)

    with tab2:
        render_tag_analysis(db_path, scan_job_id)

    with tab3:
        render_failed_pages(db_path, scan_job_id)


# Hint dict keys must match values written to pages.failure_reason by
# crawler/core/engine.py (`http_error`, `robots_blocked`, `render_failed`,
# `fetch_failed`). The "render disabled" condition is surfaced separately
# via the live progress event's `warning` field, not via failure_reason.
_FAILURE_REASON_HINTS = {
    "http_error": (
        "All fetch attempts failed (DNS, refused, 4xx/5xx, timeout). "
        "Verify the URL is reachable in a browser; check that you used "
        "https:// not http:// if the site requires TLS."
    ),
    "robots_blocked": (
        "robots.txt forbids crawling these URLs. "
        "This is the site's policy, not a bug."
    ),
    "render_failed": (
        "Plain HTTP succeeded but the Playwright render attempt failed. "
        "Check `playwright install chromium` and the application logs."
    ),
    "fetch_failed": (
        "Generic fetch failure. See logs for the underlying exception."
    ),
}


def _render_zero_resources_diagnosis(db_path: str, scan_job_id: int) -> None:
    """Replace the misleading 'No resources found' message with an actionable
    diagnosis: how many pages were fetched vs failed, and what the failure
    reasons were. Only renders when zero resources were extracted."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        counts = {
            row["status"]: row["c"]
            for row in conn.execute(
                "SELECT status, COUNT(*) AS c FROM pages "
                "WHERE scan_job_id = ? GROUP BY status",
                (scan_job_id,),
            )
        }
        failure_groups = conn.execute(
            "SELECT failure_reason, COUNT(*) AS c FROM pages "
            "WHERE scan_job_id = ? AND status = 'failed' "
            "GROUP BY failure_reason ORDER BY c DESC",
            (scan_job_id,),
        ).fetchall()

    fetched = counts.get("fetched", 0)
    failed = counts.get("failed", 0)
    pending = counts.get("pending", 0)
    total = fetched + failed + pending

    if failed and not fetched:
        # All pages failed — the misleading "No resources" goes away
        # entirely; show what actually went wrong. Defensive: count vs
        # group_by races (writer commits between the two queries) can
        # produce failed>0 with empty failure_groups.
        if not failure_groups:
            st.error(f"Scan failed: {failed} page(s) errored out.")
            return
        primary = failure_groups[0]
        reason = primary["failure_reason"] or "(unknown)"
        st.error(
            f"Scan failed: all {failed} page(s) errored out before "
            f"resources could be extracted. "
            f"Most common failure: **{reason}** ({primary['c']} of {failed})."
        )
        hint = _FAILURE_REASON_HINTS.get(reason)
        if hint:
            st.caption(hint)
        if len(failure_groups) > 1:
            with st.expander("All failure reasons"):
                st.dataframe(
                    [{"Reason": g["failure_reason"] or "(unknown)",
                      "Count": g["c"]} for g in failure_groups],
                    use_container_width=True, hide_index=True,
                )
    elif fetched and not failed:
        # Pages loaded fine but the parser found nothing extractable.
        st.warning(
            f"Crawled {fetched} page(s) successfully but the parser "
            f"extracted **0 resources**. Likely causes: the site needs "
            f"JS rendering (try **Force Playwright** in the sidebar), or "
            f"its HTML structure doesn't match the resource-extraction "
            f"heuristics (looking for `<article>`, `og:title`, card grids)."
        )
    elif fetched and failed:
        st.warning(
            f"Crawled {fetched} page(s) successfully and {failed} "
            f"failed. Parser extracted **0 resources** from the "
            f"successful pages."
        )
        if failure_groups:  # race-window safe (see all-failed branch)
            primary = failure_groups[0]
            reason = primary["failure_reason"] or "(unknown)"
            st.caption(
                f"Most common failure on the {failed} failed page(s): "
                f"**{reason}** ({primary['c']})."
            )
    else:
        # Fallback — shouldn't happen normally.
        st.info(
            f"No resources extracted (pages: {total} total, "
            f"{fetched} fetched, {failed} failed, {pending} pending)."
        )


def render_failed_pages(db_path: str, scan_job_id: int):
    """Show failed pages grouped by failure_reason so users can debug
    crawl problems without digging through logs."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        # Aggregate by reason for the summary table.
        groups = conn.execute(
            "SELECT failure_reason, COUNT(*) AS c FROM pages "
            "WHERE scan_job_id = ? AND status = 'failed' "
            "GROUP BY failure_reason ORDER BY c DESC",
            (scan_job_id,),
        ).fetchall()
        # Per-row drilldown.
        failed_rows = conn.execute(
            "SELECT url, failure_reason, depth FROM pages "
            "WHERE scan_job_id = ? AND status = 'failed' "
            "ORDER BY failure_reason, url",
            (scan_job_id,),
        ).fetchall()

    if not failed_rows:
        st.success("No failed pages — crawl is clean.")
        return

    st.subheader("Failure Summary")
    st.dataframe(
        [{"Reason": (g["failure_reason"] or "(unknown)"), "Count": g["c"]}
         for g in groups],
        use_container_width=True, hide_index=True,
    )

    st.subheader("Failed URLs")
    for group in groups:
        reason = group["failure_reason"] or "(unknown)"
        with st.expander(f"{reason} ({group['c']})"):
            urls = [
                {"URL": r["url"], "Depth": r["depth"]}
                for r in failed_rows if (r["failure_reason"] or "(unknown)") == reason
            ]
            st.dataframe(urls, use_container_width=True, hide_index=True)


def render_rankings(db_path: str, scan_job_id: int):
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources:
        _render_zero_resources_diagnosis(db_path, scan_job_id)
        return

    # Build DataFrame-like data for display
    data = []
    for r in resources:
        data.append({
            "Score": r.popularity_score,
            "Title": r.title,
            "Views": r.views,
            "Likes": r.likes,
            "Hearts": r.hearts,
            "Tags": ", ".join(r.tags) if r.tags else "",
            "Category": r.category,
            "Published": r.published_at,
            "URL": r.url,
        })

    st.dataframe(data, use_container_width=True, hide_index=True)

    # Export buttons
    col1, col2 = st.columns(2)
    with col1:
        csv_data = export.export_resources_csv(db_path, scan_job_id)
        st.download_button("Download CSV", csv_data, f"resources_{scan_job_id}.csv", "text/csv")
    with col2:
        json_data = export.export_resources_json(db_path, scan_job_id)
        st.download_button("Download JSON", json_data, f"resources_{scan_job_id}.json", "application/json")


def render_tag_analysis(db_path: str, scan_job_id: int):
    tags = analysis.get_tag_stats(db_path, scan_job_id)
    if not tags:
        st.info("No tags found in this scan.")
        return

    overview = analysis.get_tag_overview(db_path, scan_job_id)

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Tags", overview["total_tags"])
    with col2:
        st.metric("Total Resources", overview["total_resources"])
    with col3:
        st.metric("Avg Tags/Resource", overview["avg_tags_per_resource"])

    # Top 20 tags bar chart
    st.subheader("Top 20 Tags by Frequency")
    top_tags = tags[:20]
    chart_data = {t.name: t.resource_count for t in top_tags}
    st.bar_chart(chart_data)

    # Tag → Resource explorer
    st.subheader("Explore Tag Resources")
    tag_options = {f"{t.name} ({t.resource_count})": t for t in tags}
    selected_tag_label = st.selectbox("Select a tag", list(tag_options.keys()))
    if selected_tag_label:
        selected_tag = tag_options[selected_tag_label]
        tag_resources = analysis.get_tag_resources(db_path, selected_tag.id)
        if tag_resources:
            data = [{
                "Score": r.popularity_score,
                "Title": r.title,
                "Views": r.views,
                "URL": r.url,
            } for r in tag_resources]
            st.dataframe(data, use_container_width=True, hide_index=True)

    # Tag export
    col1, col2 = st.columns(2)
    with col1:
        csv_data = export.export_tags_csv(db_path, scan_job_id)
        st.download_button("Download Tags CSV", csv_data, f"tags_{scan_job_id}.csv", "text/csv")
    with col2:
        json_data = export.export_tags_json(db_path, scan_job_id)
        st.download_button("Download Tags JSON", json_data, f"tags_{scan_job_id}.json", "application/json")


def render_history(db_path: str):
    st.info("Enter a URL in the sidebar and click 'Start Scan' to begin.")
    jobs = storage.list_scan_jobs(db_path)
    if not jobs:
        return

    st.subheader("Previous Scans")
    data = [{
        "ID": j.id,
        "Domain": j.domain,
        "Status": j.status,
        "Pages": j.pages_scanned,
        "Resources": j.resources_found,
        "Created": j.created_at,
    } for j in jobs]
    st.dataframe(data, use_container_width=True, hide_index=True)

    empty_jobs = [j for j in jobs if j.resources_found == 0]
    if empty_jobs:
        st.caption(
            f"{len(empty_jobs)} scan(s) found no resources — likely failed "
            "fetches or unparseable pages."
        )
        confirm = st.checkbox(
            f"Confirm delete of {len(empty_jobs)} empty scan(s)",
            key="confirm_purge_empty",
        )
        if st.button("Purge empty scans", key="purge_empty_btn",
                     disabled=not confirm):
            # Always clear the checkbox state — even if a per-row delete
            # raises mid-loop. Without try/finally the sticky checkbox
            # auto-re-arms next render and silently re-purges.
            try:
                for j in empty_jobs:
                    storage.delete_scan_job(db_path, j.id)
                    if st.session_state.get("scan_job_id") == j.id:
                        st.session_state.scan_job_id = None
            finally:
                st.session_state.pop("confirm_purge_empty", None)
            st.success(f"Deleted {len(empty_jobs)} empty scan(s).")
            st.rerun()


if __name__ == "__main__":
    main()
