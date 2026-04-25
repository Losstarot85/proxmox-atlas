import asyncio
import json
from cache import cache

# Interfaces to exclude (Docker, container bridges, loopback, veth pairs)
EXCLUDED_IFACE_PREFIXES = ("docker", "br-", "veth", "cni", "flannel", "cali", "tunl", "virbr")

def _enrich_resources_with_ips(cluster_name, resources):
    """Merge filtered IP addresses from network cache into each resource."""
    network_data = cache.get(cluster_name, {}).get("network", [])
    ip_by_vmid = {}
    for entry in network_data:
        vmid = entry.get("vmid")
        if vmid and entry.get("ips"):
            filtered = [
                ip_entry["ip"] for ip_entry in entry["ips"]
                if not ip_entry.get("interface", "").startswith(EXCLUDED_IFACE_PREFIXES)
                and not ip_entry.get("ip", "").startswith("127.")
            ]
            if filtered:
                ip_by_vmid[vmid] = filtered
    
    enriched = []
    for r in resources:
        r_copy = dict(r)
        r_copy["ips"] = ip_by_vmid.get(r.get("vmid"), [])
        enriched.append(r_copy)
    return enriched

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
            # Merge per-phase errors into a single field for frontend compatibility
            node_err = data.get("node_error")
            resource_err = data.get("resource_error")
            combined_error = None
            if node_err and resource_err:
                combined_error = f"Nodes: {node_err} | Resources: {resource_err}"
            elif node_err:
                combined_error = node_err
            elif resource_err:
                combined_error = resource_err

            results_by_cluster.append({
                "name": cluster_name,
                "nodes": data.get("nodes", []),
                "resources": _enrich_resources_with_ips(cluster_name, data.get("resources", [])),
                "last_update": data.get("last_update"),
                "error": combined_error,
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
