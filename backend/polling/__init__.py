import asyncio
from config import CLUSTERS
from polling.nodes import fetch_nodes_from_proxmox
from polling.resources import fetch_resources_from_proxmox


async def poll_proxmox():
    """Loop di polling continuo per tutti i cluster."""
    while True:
        await asyncio.gather(*[
            poll_cluster(cluster) for cluster in CLUSTERS
        ])
        await asyncio.sleep(15)


async def poll_cluster(cluster: dict):
    """Polling sequenziale di un singolo cluster: prima nodi, poi risorse."""
    await fetch_nodes_from_proxmox(cluster)
    await fetch_resources_from_proxmox(cluster)
