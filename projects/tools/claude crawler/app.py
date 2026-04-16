"""Streamlit Web UI for Claude Crawler."""

import queue
import threading
import time

import streamlit as st

from crawler import config, storage, analysis, export
from crawler.core.engine import run_crawl


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
        max_pages = st.slider("Max Pages", 10, 500, config.MAX_PAGES)
        max_depth = st.slider("Max Depth", 1, 5, config.MAX_DEPTH)
        rate_limit = st.slider("Rate Limit (sec)", 0.5, 5.0, config.RATE_LIMIT, 0.5)

        if st.button("Start Scan", disabled=st.session_state.scan_running, type="primary"):
            if not url:
                st.error("Please enter a URL")
                return
            start_scan(db_path, url, max_pages, max_depth, rate_limit)

        # History selector
        st.divider()
        st.header("History")
        jobs = storage.list_scan_jobs(db_path)
        if jobs:
            options = {f"#{j.id} {j.domain} ({j.status})": j.id for j in jobs}
            selected = st.selectbox("Previous Scans", list(options.keys()))
            if st.button("Load Scan"):
                st.session_state.scan_job_id = options[selected]
                st.session_state.scan_running = False
                st.rerun()


def start_scan(db_path: str, url: str, max_pages: int, max_depth: int, rate_limit: float):
    progress_queue = queue.Queue()
    st.session_state.scan_running = True
    st.session_state.progress = {"pages_done": 0, "pages_total": max_pages, "current_url": url, "status": "starting"}
    st.session_state._progress_queue = progress_queue

    def worker():
        try:
            job_id = run_crawl(url, db_path, max_pages, max_depth, rate_limit, progress_queue)
            # Compute scores after crawl
            analysis.compute_scores(db_path, job_id)
            progress_queue.put({"status": "completed", "scan_job_id": job_id})
        except Exception as e:
            progress_queue.put({"status": "failed", "error": str(e)})

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    st.rerun()


def render_progress():
    st.subheader("Scanning in progress...")

    progress_queue = st.session_state.get("_progress_queue")
    if progress_queue:
        # Drain all available progress updates
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
        st.error(f"Scan failed: {prog.get('error', 'Unknown error')}")
        return

    pages_done = prog.get("pages_done", 0)
    pages_total = prog.get("pages_total", 1)
    current_url = prog.get("current_url", "")

    col1, col2 = st.columns(2)
    with col1:
        st.metric("Pages Scanned", pages_done)
    with col2:
        st.metric("Target", pages_total)

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
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Pages Scanned", job.pages_scanned)
    with col2:
        st.metric("Resources Found", job.resources_found)
    with col3:
        overview = analysis.get_tag_overview(db_path, scan_job_id)
        st.metric("Tags Found", overview["total_tags"])

    tab1, tab2 = st.tabs(["📊 Hot Resources", "🏷️ Tag Analysis"])

    with tab1:
        render_rankings(db_path, scan_job_id)

    with tab2:
        render_tag_analysis(db_path, scan_job_id)


def render_rankings(db_path: str, scan_job_id: int):
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources:
        st.info("No resources found in this scan.")
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
    if jobs:
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


if __name__ == "__main__":
    main()
