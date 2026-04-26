"""
Health check endpoint for Proxmox Atlas.
Reports the status of all system components.
"""

import os
import time

import httpx
from fastapi import APIRouter

from cache import cache
from config import CLUSTERS

router = APIRouter()

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")


@router.get("/health")
async def health_check():
    """
    Returns detailed health status:
    - backend: always OK if this endpoint responds
    - prometheus: checks reachability
    - clusters: per-cluster last_update and error state
    """
    result = {
        "status": "healthy",
        "timestamp": time.time(),
        "components": {
            "backend": {"status": "ok"},
            "prometheus": {"status": "unknown"},
            "clusters": {}
        }
    }

    # Check Prometheus
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{PROMETHEUS_URL}/api/v1/status/runtimeinfo")
            if res.status_code == 200:
                result["components"]["prometheus"] = {"status": "ok"}
            else:
                result["components"]["prometheus"] = {
                    "status": "degraded",
                    "detail": f"HTTP {res.status_code}"
                }
                result["status"] = "degraded"
    except Exception as e:
        result["components"]["prometheus"] = {
            "status": "unreachable",
            "detail": str(e)
        }
        result["status"] = "degraded"

    # Check each cluster
    for cluster_conf in CLUSTERS:
        name = cluster_conf["name"]
        cluster_cache = cache.get(name, {})
        error = cluster_cache.get("node_error") or cluster_cache.get("resource_error")
        last_update = cluster_cache.get("last_update")
        node_count = len(cluster_cache.get("nodes", []))
        resource_count = len(cluster_cache.get("resources", []))

        if error:
            result["components"]["clusters"][name] = {
                "status": "error",
                "error": error,
                "last_update": last_update
            }
            result["status"] = "degraded"
        elif last_update is None:
            result["components"]["clusters"][name] = {
                "status": "pending",
                "detail": "Awaiting first poll"
            }
        else:
            result["components"]["clusters"][name] = {
                "status": "ok",
                "last_update": last_update,
                "nodes": node_count,
                "resources": resource_count
            }

    return result
