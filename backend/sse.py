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

    # Inviaamo a tutti i client collegati il dump della cache
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
        
        # Iteriamo su una copia per permettere rimozioni sicure
        for q in list(self.queues):
            try:
                # Usiamo put_nowait per non bloccare il loop
                if q.full():
                    continue
                q.put_nowait(payload)
            except Exception:
                self.remove_client(q)

broker = SSEBroker()
