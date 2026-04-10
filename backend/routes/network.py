import asyncio
import httpx
from datetime import datetime
from fastapi import APIRouter
from config import CLUSTERS
from cache import cache

router = APIRouter()


@router.get("/network")
async def get_network():
    results_by_cluster = []

    for cluster in CLUSTERS:
        cluster_name = cluster["name"]
        
        results_by_cluster.append({
            "name": cluster_name,
            "resources": cache[cluster_name].get("network", [])
        })

    return {
        "clusters": results_by_cluster,
        "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
