from __future__ import annotations

import json
import logging
import socket
import threading
import time
from crawler.config import NODE_ID, CLUSTER_DISCOVERY_PORT

logger = logging.getLogger(__name__)

class SwarmNode:
    """A highly resilient swarm node that never blocks the main engine."""
    def __init__(self):
        self.peers = {}
        self._stop = False
        self.node_id = NODE_ID

    def start(self):
        # Fire and forget threads
        t1 = threading.Thread(target=self._listen, daemon=True)
        t2 = threading.Thread(target=self._broadcast, daemon=True)
        t1.start()
        t2.start()

    def _broadcast(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            while not self._stop:
                try:
                    msg = json.dumps({"id": self.node_id, "t": time.time()})
                    s.sendto(msg.encode(), ('<broadcast>', CLUSTER_DISCOVERY_PORT))
                except: pass
                time.sleep(10)

    def _listen(self):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

            # R35: Enable port reuse to allow multiple local processes to listen
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                # SO_REUSEPORT is crucial for macOS/Linux to share the same port
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except AttributeError:
                pass # Not supported on some platforms (e.g. Windows), fallback to REUSEADDR

            sock.bind(("", CLUSTER_DISCOVERY_PORT))
            sock.settimeout(1.0)

            while not self._stop:
                try:
                    data, addr = sock.recvfrom(1024)
                    msg = json.loads(data.decode())
                    if msg.get("node_id") and msg["node_id"] != NODE_ID:
                        self.peers[msg["node_id"]] = time.time()
                except socket.timeout: continue
                except: pass
        except Exception as e: 
            logger.warning(f"Swarm listener failed to bind: {e}")
    def stop(self): self._stop = True

_INST = SwarmNode()
def get_swarm(): return _INST
