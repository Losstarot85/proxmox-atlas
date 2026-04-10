import asyncio
import json
from cache import cache

class SSEBroker:
    def __init__(self):
        self.queues = []

    def add_client(self):
        q = asyncio.Queue(maxsize=10)
        self.queues.append(q)
        return q

    def remove_client(self, q):
        if q in self.queues:
            self.queues.remove(q)

    # Broadcast the cache dump to all connected clients
    async def broadcast_cache(self):
        results_by_cluster = []
        for cluster_name, data in cache.items():
            results_by_cluster.append({
                "name": cluster_name,
                "nodes": data.get("nodes", []),
                "resources": data.get("resources", []),
                "last_update": data.get("last_update"),
                "error": data.get("error"),
                "failed_nodes": data.get("failed_nodes", [])
            })
            
        payload = json.dumps({"clusters": results_by_cluster})
        
        # Iterate over a copy to allow safe removal
        for q in list(self.queues):
            try:
                # Use put_nowait to avoid blocking the loop
                if q.full():
                    try:
                        # Remove the oldest message if the queue is full (no silent drop)
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(payload)
            except Exception:
                self.remove_client(q)

broker = SSEBroker()
