import asyncio
import time
from config import CLUSTERS, SETTINGS
from polling.nodes import fetch_nodes_from_proxmox
from polling.resources import fetch_resources_from_proxmox
from sse import broker
from alerts.engine import evaluate_alerts


async def poll_proxmox():
    """Loop di polling continuo per tutti i cluster con interval reattivo."""
    while True:
        start_time = time.time()
        
        await asyncio.gather(*[
            poll_cluster(cluster) for cluster in CLUSTERS
        ])
        
        # Valuta eventuali alert in base ai task eseguiti
        await evaluate_alerts()
        
        # Inoltra in tempo reale ai client connessi via SSE
        await broker.broadcast_cache()
        
        # Reactive sleep chunking per adattarsi on-the-fly alle impostazioni utente
        while True:
            elapsed = time.time() - start_time
            current_interval = SETTINGS.get("polling_interval", 15)
            if elapsed >= current_interval:
                break
            
            # Dorme al massimo un secondo alla volta
            sleep_time = min(1.0, current_interval - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
            else:
                break


async def poll_cluster(cluster: dict):
    """Polling sequenziale di un singolo cluster: prima nodi, poi risorse."""
    await fetch_nodes_from_proxmox(cluster)
    await fetch_resources_from_proxmox(cluster)
    
    from polling.network import update_network_ips_for_cluster
    await update_network_ips_for_cluster(cluster)
