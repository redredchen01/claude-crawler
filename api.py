from __future__ import annotations

import logging
import queue
import threading
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from crawler.core.engine import run_crawl
from crawler.core.monitoring import setup_logging
from crawler.storage import get_scan_job, list_scan_jobs, get_resources, init_db
from crawler.config import DB_PATH

setup_logging()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Claude Crawler API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db(DB_PATH)

# Global store for active scan progress
# In a real production app, this might be Redis, but for this demo, local memory is fine.
active_scans: Dict[int, queue.Queue] = {}

class ScanConfig(BaseModel):
    url: str = Field(..., description="The entry URL to start crawling from")
    max_pages: int = Field(50, ge=1, le=1000)
    max_depth: int = Field(3, ge=1, le=10)
    workers: int = Field(5, ge=1, le=20)
    force_playwright: bool = Field(False)
    req_per_sec: float = Field(2.0, ge=0.1, le=10.0)

class ScanStatus(BaseModel):
    id: int
    entry_url: str
    status: str
    pages_scanned: int
    max_pages: int
    resources_found: int
    completed_at: Optional[str] = None

def _run_scan_task(job_id: int, config: ScanConfig, q: queue.Queue):
    try:
        run_crawl(
            entry_url=config.url,
            db_path=DB_PATH,
            max_pages=config.max_pages,
            max_depth=config.max_depth,
            req_per_sec=config.req_per_sec,
            workers=config.workers,
            force_playwright=config.force_playwright,
            scan_job_id=job_id, # CRITICAL FIX: Pass the job_id we created
            progress_queue=q
        )
    except Exception as e:
        logger.exception(f"Scan job {job_id} failed: {e}")
    finally:
        # We keep the queue for a bit so the UI can finish reading the last messages
        # In a real app, we'd have a cleanup strategy.
        pass

@app.post("/scans", response_model=Dict[str, Any])
async def start_scan(config: ScanConfig, background_tasks: BackgroundTasks):
    # Create the scan job in DB to get an ID
    # Note: run_crawl also calls create_scan_job, but we need the ID now.
    # To avoid double creation, we'll let run_crawl handle it and use a temporary mapping if needed,
    # or refactor engine to return ID sooner. 
    # For now, let's use a simple approach: run_crawl returns the job_id.
    
    q = queue.Queue()
    # Since run_crawl creates the job, we need to run it to get the ID.
    # We'll run it in a thread and use a Future to get the ID if we wanted it synchronously,
    # but run_crawl is designed to work with an entry_url.
    
    # Let's start the crawl and capture the ID from the first progress message or return value.
    # Actually, run_crawl returns the scan_job_id at the end. 
    # Let's refactor create_scan_job to be usable here.
    
    from crawler.storage import create_scan_job
    from urllib.parse import urlparse
    
    job_id = create_scan_job(DB_PATH, config.url, urlparse(config.url).netloc, config.max_pages, config.max_depth)
    active_scans[job_id] = q
    
    background_tasks.add_task(_run_scan_task, job_id, config, q)
    
    return {"job_id": job_id, "status": "pending"}

@app.get("/scans", response_model=List[ScanStatus])
async def list_scans():
    jobs = list_scan_jobs(DB_PATH)
    return [
        ScanStatus(
            id=j.id,
            entry_url=j.entry_url,
            status=j.status,
            pages_scanned=j.pages_scanned,
            max_pages=j.max_pages,
            resources_found=j.resources_found,
            completed_at=j.completed_at
        ) for j in jobs
    ]

@app.get("/scans/{job_id}", response_model=ScanStatus)
async def get_scan(job_id: int):
    job = get_scan_job(DB_PATH, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return ScanStatus(
        id=job.id,
        entry_url=job.entry_url,
        status=job.status,
        pages_scanned=job.pages_scanned,
        max_pages=job.max_pages,
        resources_found=job.resources_found,
        completed_at=job.completed_at
    )

@app.get("/scans/{job_id}/resources")
async def get_scan_resources(job_id: int):
    resources = get_resources(DB_PATH, job_id)
    return resources

@app.get("/scans/{job_id}/stream")
async def stream_scan_progress(job_id: int):
    if job_id not in active_scans:
        # If it's not in memory, maybe it finished? 
        # For a better UX, we could send a "completed" message immediately.
        job = get_scan_job(DB_PATH, job_id)
        if job and job.status in ("completed", "failed"):
             def finished_event():
                 import json
                 yield f"data: {json.dumps({'status': job.status, 'pages_done': job.pages_scanned, 'pages_total': job.max_pages})}\n\n"
             return StreamingResponse(finished_event(), media_type="text/event-stream")
        raise HTTPException(status_code=404, detail="Active scan stream not found")

    q = active_scans[job_id]

    def event_generator():
        import json
        while True:
            try:
                # Wait for progress updates from the engine
                data = q.get(timeout=30)
                yield f"data: {json.dumps(data)}\n\n"
                if data.get("status") in ("completed", "failed"):
                    break
            except queue.Empty:
                # Send keep-alive
                yield ": keep-alive\n\n"
            except Exception as e:
                logger.error(f"Stream error: {e}")
                break
        
        # Cleanup when done
        if job_id in active_scans:
            del active_scans[job_id]

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
