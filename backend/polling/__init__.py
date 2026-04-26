import asyncio
import time

from alerts.engine import evaluate_alerts
from config import CLUSTERS, SETTINGS
from polling.nodes import fetch_nodes_from_proxmox
from polling.resources import fetch_resources_from_proxmox
from sse import broker


async def poll_proxmox():
    """Continuous polling loop for all clusters with reactive interval."""
    while True:
        start_time = time.time()

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


async def poll_cluster(cluster: dict):
    """Sequential polling for a single cluster: nodes first, then resources."""
    await fetch_nodes_from_proxmox(cluster)
    await fetch_resources_from_proxmox(cluster)

    from polling.network import update_network_ips_for_cluster

    await update_network_ips_for_cluster(cluster)
