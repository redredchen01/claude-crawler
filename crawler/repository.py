from __future__ import annotations
import sqlite3
from typing import Optional, List
from crawler import storage
from crawler.models import Resource, ScanJob

class DatabaseRepository:
    """Central repository for all database operations. Implements Repository Pattern."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path

    def get_job(self, job_id: int) -> Optional[ScanJob]:
        return storage.get_scan_job(self.db_path, job_id)

    def save_resource(self, resource: Resource) -> int:
        return storage.save_resource_with_tags(self.db_path, resource)

    def search(self, query: str) -> List[Resource]:
        return storage.search_resources(self.db_path, query)

    def get_pending_pages(self, job_id: int) -> List[dict]:
        with storage.get_connection(self.db_path) as conn:
            return conn.execute(
                "SELECT url, depth, id FROM pages WHERE scan_job_id=? AND status='pending'",
                (job_id,)
            ).fetchall()
            
    def update_job_status(self, job_id: int, status: str):
        storage.update_scan_job(self.db_path, job_id, status=status)
