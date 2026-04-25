from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import json
import os
from config import CONFIG_PATH
from logger import get_logger

log = get_logger("routes.clusters")

router = APIRouter()


class ClusterCreate(BaseModel):
    name: str
    host: str
    token_id: str
    token_secret: str
    verify_ssl: Optional[bool] = False


def _load_clusters_file():
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_clusters_file(clusters_list):
    with open(CONFIG_PATH, "w") as f:
        json.dump(clusters_list, f, indent=2)


def _hot_reload_clusters(clusters_list):
    """Hot-reload CLUSTERS, cache, and reconfigure Prometheus without restart."""
    import config
    from cache import cache

    # Update the global list in-place
    config.CLUSTERS.clear()
    config.CLUSTERS.extend(clusters_list)

    # Sync the cache: add new entries, remove old ones
    current_names = {c["name"] for c in clusters_list}
    
    # Remove clusters no longer present
    for name in list(cache.keys()):
        if name not in current_names:
            del cache[name]
    
    # Add new clusters
    for c in clusters_list:
        if c["name"] not in cache:
            cache[c["name"]] = {
                "nodes": [],
                "resources": [],
                "network": [],
                "last_update": None,
                "node_error": None,
                "resource_error": None,
                "failed_nodes": []
            }

    # Regenerate Prometheus config to include/exclude new targets
    try:
        from prometheus_config import generate_prometheus_config
        generate_prometheus_config()
    except Exception as e:
        log.warning("prometheus_config_failed", error=str(e))


@router.get("/clusters")
def list_clusters():
    clusters = _load_clusters_file()
    # Non esporre i token_secret in chiaro nel GET
    safe = []
    for c in clusters:
        safe.append({
            "name": c["name"],
            "host": c["host"],
            "token_id": c["token_id"],
            "token_secret_masked": c["token_secret"][:8] + "••••••••",
            "verify_ssl": c.get("verify_ssl", False)
        })
    return {"clusters": safe}


@router.post("/clusters")
def add_cluster(cluster: ClusterCreate):
    clusters = _load_clusters_file()

    # Check name uniqueness
    if any(c["name"] == cluster.name for c in clusters):
        raise HTTPException(status_code=409, detail=f"Cluster '{cluster.name}' already exists")

    new_entry = {
        "name": cluster.name,
        "host": cluster.host.rstrip("/"),
        "token_id": cluster.token_id,
        "token_secret": cluster.token_secret,
        "verify_ssl": cluster.verify_ssl
    }
    clusters.append(new_entry)
    _save_clusters_file(clusters)
    _hot_reload_clusters(clusters)

    return {"status": "created", "cluster": cluster.name}


@router.delete("/clusters/{name}")
def delete_cluster(name: str):
    clusters = _load_clusters_file()
    
    new_list = [c for c in clusters if c["name"] != name]
    if len(new_list) == len(clusters):
        raise HTTPException(status_code=404, detail=f"Cluster '{name}' not found")

    _save_clusters_file(new_list)
    _hot_reload_clusters(new_list)

    return {"status": "deleted", "cluster": name}


@router.post("/clusters/test")
async def test_cluster_connection(cluster: ClusterCreate):
    """Tests the connection to a Proxmox cluster by verifying API reachability."""
    host = cluster.host.rstrip("/")
    headers = {"Authorization": f"PVEAPIToken={cluster.token_id}={cluster.token_secret}"}

    try:
        async with httpx.AsyncClient(verify=cluster.verify_ssl, timeout=8.0) as client:
            res = await client.get(f"{host}/api2/json/version", headers=headers)
            res.raise_for_status()
            version_data = res.json().get("data", {})

            return {
                "status": "ok",
                "version": version_data.get("version", "unknown"),
                "release": version_data.get("release", "unknown"),
                "repoid": version_data.get("repoid", "unknown")
            }
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Host unreachable. Check the address and port.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code,
                            detail=f"Authentication failed (HTTP {e.response.status_code}). Check token_id and token_secret.")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Connection timeout (8s). Host too slow or firewall active.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
