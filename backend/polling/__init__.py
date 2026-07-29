import asyncio
import time

from alerts.engine import evaluate_alerts
from config import CLUSTERS, SETTINGS, is_demo_mode
from polling.nodes import fetch_nodes_from_proxmox
from polling.resources import fetch_resources_from_proxmox
from sse import broker


async def poll_proxmox():
    """Continuous polling loop for all clusters with reactive interval.
    When DEMO_MODE is active or no clusters are configured, uses synthetic data."""
    while True:
        start_time = time.time()

        if is_demo_mode() or len(CLUSTERS) == 0:
            await _poll_demo()
        else:
            await asyncio.gather(*[poll_cluster(cluster) for cluster in CLUSTERS])

        # Evaluate alerts based on the completed tasks
        await evaluate_alerts()

        # Forward in real-time to connected SSE clients
        await broker.broadcast_cache()

        # Reactive sleep chunking to adapt on-the-fly to user settings
        while True:
            elapsed = time.time() - start_time
            current_interval = SETTINGS.get("polling_interval", 15)
            if elapsed >= current_interval:
                break

            # Sleep at most one second at a time
            sleep_time = min(1.0, current_interval - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
            else:
                break


async def _poll_demo():
    """Generate synthetic demo data and inject it into the cache."""
    from cache import cache
    from polling.demo_generator import generate_demo_data

    demo_clusters = generate_demo_data()

    for cluster_name, data in demo_clusters.items():
        if cluster_name not in cache:
            cache[cluster_name] = {
                "nodes": [],
                "resources": [],
                "network": [],
                "last_update": None,
                "node_error": None,
                "resource_error": None,
                "failed_nodes": [],
            }

        cache[cluster_name]["nodes"] = data["nodes"]
        cache[cluster_name]["resources"] = data["resources"]
        cache[cluster_name]["backups"] = data["backups"].get("backups", [])
        cache[cluster_name]["last_update"] = time.time()
        cache[cluster_name]["node_error"] = None
        cache[cluster_name]["resource_error"] = None
        cache[cluster_name]["failed_nodes"] = []


async def poll_cluster(cluster: dict):
    """Sequential polling for a single cluster: nodes first, then resources."""
    await fetch_nodes_from_proxmox(cluster)
    await fetch_resources_from_proxmox(cluster)

    from polling.network import update_network_ips_for_cluster

    await update_network_ips_for_cluster(cluster)

    from polling.backups import fetch_backups_from_proxmox

    await fetch_backups_from_proxmox(cluster)
