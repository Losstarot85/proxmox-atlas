import asyncio
import httpx
from datetime import datetime
from fastapi import APIRouter
from config import CLUSTERS
from cache import cache
from polling.network import fetch_ips_for_resource

router = APIRouter()


@router.get("/network")
async def get_network():
    results_by_cluster = []

    for cluster in CLUSTERS:
        cluster_name = cluster["name"]
        host = cluster["host"]
        headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
        verify_ssl = cluster.get("verify_ssl", False)

        running_resources = [
            r for r in cache[cluster_name]["resources"]
            if r["status"] == "running"
        ]

        async with httpx.AsyncClient(verify=verify_ssl) as client:
            tasks = [fetch_ips_for_resource(client, r, host, headers) for r in running_resources]
            results = await asyncio.gather(*tasks)

        results_by_cluster.append({
            "name": cluster_name,
            "resources": list(results)
        })

    return {
        "clusters": results_by_cluster,
        "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
