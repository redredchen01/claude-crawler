from __future__ import annotations

import sqlite3
import time
import threading
from collections import Counter
from urllib.parse import urlparse

import streamlit as st
import pandas as pd
from crawler import analysis, config, export, storage
from crawler.core.engine import run_crawl
from crawler.core.monitoring import get_event_logger, setup_logging
from crawler.core.cluster import get_swarm

# Initialize industrial logging
setup_logging()

def _normalize_entry_url(raw: str) -> str | None:
    """Normalize a user-provided URL entry.

    Adds https:// if no scheme is present. Rejects empty/whitespace,
    non-HTTP(S) schemes, and pseudo‑schemes (javascript:, mailto:, etc.).
    """
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None

    # Reject whitespace in host part (detectable before scheme is added)
    if " " in text:
        return None

    lower = text.lower()

    # --- Scheme handling ---
    # Already has http:// or https://
    if lower.startswith("http://") or lower.startswith("https://"):
        # Check private hosts first
        from crawler import config
        from crawler.core.url import is_private_host
        if not config.ALLOW_PRIVATE_HOSTS:
            parsed = urlparse(text)
            hostname = parsed.hostname or ""
            if hostname and is_private_host(hostname):
                return None
        # Lowercase the scheme part
        scheme_end = text.find("://") + 3
        return text[:scheme_end].lower() + text[scheme_end:]
    # Protocol-relative URL
    if lower.startswith("//"):
        return "https:" + text

    # --- Check for schemes without "://" (pseudo-schemes) ---
    colon_pos = text.find(":")
    if colon_pos != -1:
        scheme = text[:colon_pos].lower()
        if scheme in ("javascript", "mailto", "tel", "data"):
            return None

    # --- Extract and normalize scheme if present ---
    scheme_end = text.find("://")
    if scheme_end != -1:
        scheme = text[:scheme_end].lower()
        rest = text[scheme_end + 3:]
        if scheme in ("ftp", "file", "ssh", "javascript", "mailto", "tel", "data"):
            return None
        # Reject private/loopback/link-local hosts when SSRF protection is on
        from crawler import config
        from crawler.core.url import is_private_host
        if not config.ALLOW_PRIVATE_HOSTS:
            parsed = urlparse(text)
            hostname = parsed.hostname or ""
            if hostname and is_private_host(hostname):
                return None
        # Reconstruct with lowercase scheme
        return scheme + "://" + rest
    # No scheme: prepend https:// for processing
    effective = "https://" + text

    # --- No scheme: reject private/loopback/link-local hosts when SSRF protection is on
    from crawler import config
    from crawler.core.url import is_private_host
    if not config.ALLOW_PRIVATE_HOSTS:
        parsed = urlparse(effective)
        hostname = parsed.hostname or ""
        if not hostname or is_private_host(hostname):
            return None

    return "https://" + text

def _render_zero_resources_diagnosis(db_path: str, job_id: str) -> None:
    """Render diagnostic UX when a scan finishes with zero fetched resources."""
    from crawler.storage import list_pages
    pages = list_pages(db_path, job_id)
    if not pages:
        st.info("Scan appears to still be running or produced no pages.")
        return
    failed = [p for p in pages if p.get("status") == "failed"]
    fetched = [p for p in pages if p.get("status") == "fetched"]
    pending = [p for p in pages if p.get("status") == "pending"]
    if failed:
        counter = Counter(p.get("failure_reason", "unknown") for p in failed)
        most_common_reason, most_common_count = counter.most_common(1)[0]
        if most_common_reason in ("http_error", "timeout", "playwright_error"):
            st.error(
                f"{most_common_count} page{'' if most_common_count == 1 else 's'} "
                f"failed due to {most_common_reason}. Check site availability and "
                f"network settings."
            )
            st.caption(f"Hint: try running with Playwright for {most_common_reason} scenarios.")
        else:
            st.error(
                f"{most_common_count} page{'' if most_common_count == 1 else 's'} "
                f"failed due to {most_common_reason}."
            )
        if fetched:
            st.warning(
                f'{len(fetched)} page{"s" if len(fetched) != 1 else ""} fetched successfully '
                f'but none matched expected content. Force Playwright for the {len(failed)} failed page{"s" if len(failed) != 1 else ""}.'
            )
    elif fetched:
        st.warning(
            f"{len(fetched)} page{'' if len(fetched) == 1 else 's'} fetched successfully "
            "but none matched expected content. Force Playwright."
        )
    else:
        st.info("Scan completed but no pages fetched; likely interrupted early.")

def _get_local_asset(job_id, remote_url):
    import hashlib
    import os
    if not remote_url or not isinstance(remote_url, str) or len(remote_url) < 5:
        return None
    ext = os.path.splitext(remote_url.split('?')[0])[1] or ".jpg"
    filename = hashlib.md5(remote_url.encode()).hexdigest() + ext
    path = f"data/assets/{job_id}/{filename}"
    
    if os.path.exists(path):
        if os.path.getsize(path) > 200:
            return path
        else:
            try: os.remove(path)
            except: pass
            
    if not remote_url.startswith(("http://", "https://", "//")):
        return None
    return remote_url


def main():
    st.set_page_config(page_title="Claude Crawler", page_icon="🛰️", layout="wide")
    
    # Superior Unit J3: Tactical Command Deck Styling
    st.markdown("""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        
        html, body, [data-testid="stAppViewContainer"] {
            font-family: 'JetBrains Mono', monospace;
            background-color: #0e1117;
            color: #00ff41;
        }
        
        h1, h2, h3 {
            color: #ff4b2b !important;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid #ff4b2b;
        }
        
        .stButton>button {
            background-color: #ff4b2b;
            color: white;
            border-radius: 0;
            border: 1px solid #ff4b2b;
            transition: all 0.3s;
        }
        
        .stButton>button:hover {
            background-color: transparent;
            color: #ff4b2b;
            box-shadow: 0 0 10px #ff4b2b;
        }
        
        [data-testid="stSidebar"] {
            background-color: #161b22;
            border-right: 1px solid #30363d;
        }
        
        .stMetric {
            background-color: #161b22;
            padding: 15px;
            border: 1px solid #30363d;
            border-left: 5px solid #00ff41;
        }
        
        /* Neon tag effect */
        .stTag {
            background-color: #00ff4133;
            border: 1px solid #00ff41;
            color: #00ff41;
        }
        </style>
    """, unsafe_allow_html=True)
    if "scan_running" not in st.session_state: st.session_state.scan_running = False
    if "scan_job_id" not in st.session_state: st.session_state.scan_job_id = None
    if "fatal_error" not in st.session_state: st.session_state.fatal_error = None
    if "search_mode" not in st.session_state: st.session_state.search_mode = False

    db_path = config.DB_PATH
    storage.init_db(db_path)

    # Sidebar
    with st.sidebar:
        st.header("Strategic Command")
        target_url = st.text_input("Target URL", placeholder="https://...")
        max_p = st.slider("Scope", 10, 2000, config.MAX_PAGES)
        st.session_state.max_p = max_p
        workers = st.slider("Threads", 1, 16, config.WORKER_COUNT)
        
        if st.button("🚀 LAUNCH SCAN", disabled=st.session_state.scan_running, type="primary"):
            if target_url:
                normalized = _normalize_entry_url(target_url)
                if normalized:
                    st.session_state.fatal_error = None
                    start_scan(db_path, normalized, max_p, workers)
                    st.rerun()
                else:
                    st.error("Invalid or prohibited URL. Please provide a valid public HTTP(S) link.")

        st.divider()
        if st.button("📜 RESET DASHBOARD"):
            st.session_state.scan_running = False
            st.session_state.scan_job_id = None
            st.session_state.fatal_error = None
            st.rerun()

        st.divider()
        st.header("🔍 Knowledge Discovery")
        search_query = st.text_input("Full-text Search", placeholder="e.g. 'Python crawl'")
        if search_query:
            st.session_state.search_mode = True
            st.session_state.search_query = search_query
        else:
            st.session_state.search_mode = False

    # Error Display
    if st.session_state.fatal_error:
        st.error(f"FATAL ENGINE ERROR: {st.session_state.fatal_error}")

    # Main Canvas
    if st.session_state.scan_running:
        render_progress()
    elif getattr(st.session_state, "search_mode", False):
        render_search_results(db_path, st.session_state.search_query)
    elif st.session_state.scan_job_id:
        render_results(db_path, st.session_state.scan_job_id)
    else:
        render_history(db_path)


def render_search_results(db_path, query):
    st.title(f"🔍 Search Results: '{query}'")
    results = storage.search_resources(db_path, query)
    
    if results:
        df = pd.DataFrame([{
            "Title": r["title"],
            "Snippet": r.get("search_snippet", ""),
            "Category": r["category"],
            "URL": r["url"]
        } for r in results])
        
        # Display with HTML for bolding
        st.write("### 📄 Matching Intelligence")
        for res in results:
            with st.expander(f"{res['title']} ({res['category']})"):
                st.markdown(f"**Context:** ...{res.get('search_snippet', '')}...", unsafe_allow_html=True)
                st.write(f"**URL:** {res['url']}")
                st.image(res["cover_url"], use_container_width=True)
    else:
        st.warning("No matches found in the knowledge base.")

def start_scan(db_path, url, max_p, workers):
    import queue
    domain = urlparse(url).netloc
    job_id = storage.create_scan_job(db_path, url, domain, max_p, 3)
    
    st.session_state.scan_job_id = job_id
    st.session_state.scan_running = True
    
    # R34: Real-time progress bridge
    pq = queue.Queue()
    st.session_state.progress_queue = pq
    
    def worker():
        try:
            run_crawl(url, db_path, max_pages=max_p, workers=workers, scan_job_id=job_id, progress_queue=pq)
            analysis.compute_scores(db_path, job_id)
        except Exception as e:
            st.session_state.fatal_error = str(e)
            st.session_state.scan_running = False

    threading.Thread(target=worker, daemon=True).start()

def render_progress():
    st.title("🛰️ Tactical Command Center")
    job_id = st.session_state.scan_job_id
    db_path = config.DB_PATH
    pq = st.session_state.get("progress_queue")

    # Static placeholders for smooth updates
    metrics_slot = st.empty()
    progress_slot = st.empty()
    log_slot = st.empty()
    
    # R34: High-frequency refresh loop
    while st.session_state.scan_running:
        # Check for updates in the queue
        stats = None
        try:
            # Drain queue and take latest only
            while pq and not pq.empty():
                stats = pq.get_nowait()
        except: pass
        
        # Fallback to DB if queue is empty or not yet ready
        if not stats:
            try: stats = storage.get_realtime_stats(db_path, job_id)
            except: pass

        if stats:
            if stats["status"] in ("completed", "failed"):
                st.session_state.scan_running = False
                break
                
            # Update Metrics
            with metrics_slot.container():
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Captured", stats["pages_done"])
                c2.metric("Resources", stats["resources_found"])
                latency = stats.get("latency_ms", 0) or stats.get("avg_page_time_ms", 0)
                c3.metric("Latency", f"{latency}ms")
                swarm = get_swarm()
                active_peers = len([p for p, t in swarm.peers.items() if time.time() - t < 30])
                c4.metric("Swarm Nodes", active_peers + 1)
            
            # Update Progress Bar
            progress_slot.progress(min(stats["pages_done"]/(st.session_state.get("max_p", config.MAX_PAGES) or 100), 1.0))
            
            # Update Log Feed
            with log_slot.container():
                st.subheader("📡 Intelligence Feed")
                curr_url = stats.get("current_url", "Listening...")
                st.code(f"SCANNING >> {curr_url}", language="text")
                if "warning" in stats:
                    st.warning(stats["warning"])

        time.sleep(0.1) # 10Hz smoothness
    
    st.rerun() # Exit loop and show results


def render_results(db_path, job_id):
    job = storage.get_scan_job(db_path, job_id)
    if not job: return
    st.title(f"🔍 Mission Intelligence: {job.domain}")
    st.caption(f"Scan Scope: {job.max_pages} pages | Completed: {job.completed_at}")

    tab1, tab2, tab3, tab4 = st.tabs(["🏆 Popularity", "🏷️ Tag Analysis", "🧠 Content Intelligence", "🖼️ Asset Gallery"])

    with tab1:
        res = storage.get_resources(db_path, job_id)
        if res:
            # Show top 5 with images
            st.subheader("Top Resources")
            cols = st.columns(5)
            for i, r in enumerate(res[:5]):
                with cols[i]:
                    img_src = _get_local_asset(job_id, r.cover_url)
                    if img_src:
                        try:
                            st.image(img_src, caption=r.title[:20], use_container_width=True)
                        except Exception:
                            st.warning("🖼️ Image Error")
                    else:
                        st.info("No Image")
                    st.caption(f"Score: {r.popularity_score}")

            df = pd.DataFrame([{
                "Score": r.popularity_score,
                "Title": r.title, 
                "Category": r.category,
                "Views": r.views, 
                "URL": r.url
            } for r in res])
            st.dataframe(df.sort_values("Score", ascending=False), use_container_width=True, hide_index=True)
        else:
            st.error("No resources identified.")
            _render_zero_resources_diagnosis(db_path, job_id)

    with tab2:
        overview = analysis.get_tag_overview(db_path, job_id)
        c1, c2, c3 = st.columns(3)
        c1.metric("Unique Tags", overview["total_tags"])
        c2.metric("Resources", overview["total_resources"])
        c3.metric("Avg Tags/Res", overview["avg_tags_per_resource"])

        tags = analysis.get_tag_stats(db_path, job_id)
        if tags:
            tag_df = pd.DataFrame([{"Tag": t.name, "Frequency": t.resource_count} for t in tags])
            st.bar_chart(tag_df.set_index("Tag").head(20))
            
            st.subheader("🤝 Tag Correlation")
            st.write("Topics that frequently appear together in the same resource.")
            co_occur = analysis.get_tag_cooccurrence(db_path, job_id)
            if co_occur:
                co_df = pd.DataFrame([{
                    "Topic A": c["pair"][0],
                    "Topic B": c["pair"][1],
                    "Strength": c["count"]
                } for c in co_occur])
                st.table(co_df.head(10))
            else:
                st.caption("No significant tag correlations found yet.")
                
            st.subheader("📦 All Tags")
            st.dataframe(tag_df, use_container_width=True, hide_index=True)
        else:
            st.info("No tags extracted. Ensure multi-signal tagging is enabled.")

    with tab3:
        st.subheader("SimHash Content Clusters")
        st.write("Groups of resources identified as near-duplicate content based on 64-bit SimHash fingerprints.")
        
        clusters = analysis.get_cluster_report(db_path, job_id)
        if clusters:
            for i, c in enumerate(clusters):
                with st.expander(f"Cluster #{i+1}: {c['representative_title']} ({c['size']} items, avg popularity {c['avg_popularity']})"):
                    st.write("**Common Tags:** " + (", ".join(c["common_tags"]) if c["common_tags"] else "None"))
                    st.write("**Matching URLs:**")
                    for url in c["urls"]:
                        st.markdown(f"- {url}")
        else:
            st.success("No significant content clusters found. All resources appear unique.")
            
        st.divider()
        st.subheader("🔎 Semantic Discovery")
        selected_res = st.selectbox("Find related items for:", res, format_func=lambda x: x.title)
        if selected_res:
            similar = analysis.get_similar_items(db_path, selected_res.id)
            if similar:
                st.write(f"Items related to **{selected_res.title}**:")
                cols = st.columns(len(similar))
                for i, s in enumerate(similar):
                    with cols[i]:
                        img_src = _get_local_asset(job_id, s.cover_url)
                        if img_src:
                            try:
                                st.image(img_src, use_container_width=True)
                            except Exception:
                                st.warning("🖼️ Err")
                        else:
                            st.info("No Image")
                        st.caption(s.title[:20])
            else:
                st.info("No similar items found for this specific resource.")

    with tab4:
        st.subheader("Archived Resource Gallery")
        if res:
            # Simple grid for all images
            cols = st.columns(6)
            for i, r in enumerate(res):
                local_path = _get_local_asset(job_id, r.cover_url)
                # Only show if it's a confirmed local file path
                if local_path and isinstance(local_path, str) and local_path.startswith("data/"):
                    with cols[i % 6]:
                        try:
                            st.image(local_path, use_container_width=True)
                            st.caption(r.title[:15])
                        except Exception:
                            pass
        else:
            st.info("No assets archived for this mission.")

def render_history(db_path):
    st.title("🛰️ Strategic Intelligence Archive")
    
    # R29: Global Metrics Summary
    with get_swarm()._l1_lock if hasattr(get_swarm(), "_l1_lock") else threading.Lock():
         # Simplified global count
         try:
            with storage.get_connection(db_path) as conn:
                total_res = conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
                total_tags = conn.execute("SELECT COUNT(DISTINCT name) FROM tags").fetchone()[0]
         except: total_res, total_tags = 0, 0

    c1, c2, c3 = st.columns(3)
    c1.metric("Intelligence Assets", total_res)
    c2.metric("Known Topics", total_tags)
    c3.metric("System Status", "Ready")

    st.subheader("Mission Management")
    jobs = storage.list_scan_jobs(db_path)
    if jobs:
        # R31: Interactive management list
        for j in sorted(jobs, key=lambda x: x.id, reverse=True):
            cols = st.columns([1, 4, 2, 2, 2])
            cols[0].write(f"`#{j.id}`")
            cols[1].write(f"**{j.domain}**")
            cols[2].write(f"📦 {j.resources_found}")
            
            # Action buttons
            if cols[3].button("📂 VIEW", key=f"view_{j.id}"):
                st.session_state.scan_job_id = j.id
                st.rerun()
                
            if cols[4].button("🗑️ DELETE", key=f"del_{j.id}"):
                storage.delete_scan_job(db_path, j.id)
                st.toast(f"Mission #{j.id} purged successfully.", icon="🔥")
                st.rerun()
                
        st.divider()
        st.write("### Quick Overview Table")
        df = pd.DataFrame([{"ID": j.id, "Target": j.domain, "Status": j.status, "Resources": j.resources_found} for j in jobs])
        st.dataframe(df.sort_values("ID", ascending=False), use_container_width=True, hide_index=True)
    
    # Global Tag Cloud (Top 30)
    st.subheader("🌐 Global Trending Topics")
    # We'll use a hack to get all tags across jobs
    try:
        with storage.get_connection(db_path) as conn:
            all_tags = conn.execute("SELECT name, SUM(resource_count) as total FROM tags GROUP BY name ORDER BY total DESC LIMIT 30").fetchall()
        if all_tags:
            tag_data = [{"Tag": t[0], "Count": t[1]} for t in all_tags]
            st.bar_chart(pd.DataFrame(tag_data).set_index("Tag"))
    except: pass

if __name__ == "__main__":
    main()
