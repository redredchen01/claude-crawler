from __future__ import annotations
import threading
import re
from urllib.parse import urlparse

class ExtractionMemory:
    """Remembers successful DOM paths for specific URL patterns."""
    
    def __init__(self):
        # (domain, pattern) -> css_selector/path
        self._memory: dict[tuple[str, str], str] = {}
        self._lock = threading.Lock()

    def _get_pattern(self, url: str) -> str:
        """Generalize URL to a pattern (replace IDs with wildcards)."""
        path = urlparse(url).path
        # Replace numbers/IDs with '*'
        pattern = re.sub(r'/\d+', '/*', path)
        return pattern

    def remember(self, url: str, selector: str):
        domain = urlparse(url).netloc
        pattern = self._get_pattern(url)
        with self._lock:
            self._memory[(domain, pattern)] = selector

    def recall(self, url: str) -> str | None:
        domain = urlparse(url).netloc
        pattern = self._get_pattern(url)
        with self._lock:
            return self._memory.get((domain, pattern))

_GLOBAL_MEMORY = ExtractionMemory()

def get_memory(): return _GLOBAL_MEMORY
