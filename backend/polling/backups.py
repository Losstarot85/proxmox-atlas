import asyncio
from datetime import datetime
import httpx

from cache import cache
from logger import get_logger

log = get_logger("polling.backups")


async def fetch_backups_from_proxmox(cluster: dict):
    """Retrieves backup files from all active storage pools on all online nodes."""
    from config import resolve_cluster_secrets

    cluster = resolve_cluster_secrets(cluster)
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    verify_ssl = cluster.get("verify_ssl", False)

    # Get nodes from cache
    nodes = cache[cluster_name].get("nodes", [])
    all_backups = []

    async def fetch_storage_backups(node_name, storage_name):
        try:
            url = f"{host}/api2/json/nodes/{node_name}/storage/{storage_name}/content?content=backup"
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    return res.json().get("data", [])
                else:
                    # Not all storages support backup
                    return []
        except Exception as e:
            log.debug("storage_backup_fetch_failed", node=node_name, storage=storage_name, error=str(e))
            return []

    tasks = []
    # Build list of active storages on online nodes
    for node in nodes:
        if node.get("status") == "online":
            node_name = node["name"]
            for sp in node.get("storage_pools", []):
                if sp.get("active") == 1:
                    tasks.append((node_name, sp["storage"]))

    if not tasks:
        cache[cluster_name]["backups"] = []
        return

    # Run tasks concurrently
    results = await asyncio.gather(*(fetch_storage_backups(node, storage) for node, storage in tasks))

    # Parse and aggregate backup items
    seen_volids = set()
    for (node_name, storage_name), items in zip(tasks, results):
        for item in items:
            vmid = item.get("vmid")
            volid = item.get("volid")
            if vmid is not None and volid:
                # Avoid duplicate entries if a storage is shared/visible from multiple nodes
                if volid in seen_volids:
                    continue
                seen_volids.add(volid)

                all_backups.append({
                    "volid": volid,
                    "vmid": int(vmid),
                    "ctime": int(item.get("ctime", 0)),
                    "size": int(item.get("size", 0)),
                    "format": item.get("format", ""),
                    "node": node_name,
                    "storage": storage_name,
                })

    # Sort backups by ctime descending (most recent first)
    all_backups.sort(key=lambda x: x.get("ctime", 0), reverse=True)
    cache[cluster_name]["backups"] = all_backups
    log.info("backups_updated", cluster=cluster_name, count=len(all_backups))
