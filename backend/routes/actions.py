import asyncio

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from cache import cache
from config import CLUSTERS, resolve_cluster_secrets
from logger import get_logger

log = get_logger("routes.actions")
router = APIRouter()


async def refresh_resource_status(cluster_name: str):
    """Background task to wait, poll Proxmox and broadcast updated cache."""
    await asyncio.sleep(2.0)  # Wait for Proxmox status to transition
    cluster_config = next((c for c in CLUSTERS if c["name"] == cluster_name), None)
    if cluster_config:
        from polling.resources import fetch_resources_from_proxmox
        from sse import broker

        try:
            await fetch_resources_from_proxmox(cluster_config)
            await broker.broadcast_cache()
        except Exception as e:
            log.error("background_refresh_failed", cluster=cluster_name, error=str(e))


async def poll_migration_status(cluster_name: str, vmid: int, target_node: str):
    """Background task to poll Proxmox and broadcast updated cache during migration."""
    from polling.resources import fetch_resources_from_proxmox
    from sse import broker

    cluster_config = next((c for c in CLUSTERS if c["name"] == cluster_name), None)
    if not cluster_config:
        return

    for i in range(15):  # 15 times * 3 seconds = 45 seconds total
        await asyncio.sleep(3.0)
        try:
            await fetch_resources_from_proxmox(cluster_config)
            # check if VM has migrated to target_node
            cluster_cache = cache.get(cluster_name)
            if cluster_cache:
                resources = cluster_cache.get("resources", [])
                vm = next((r for r in resources if str(r["vmid"]) == str(vmid)), None)
                if vm and vm["node"] == target_node:
                    log.info(
                        "migration_completed_in_cache",
                        cluster=cluster_name,
                        vmid=vmid,
                        target=target_node,
                        iteration=i,
                    )
                    await broker.broadcast_cache()
                    return
            await broker.broadcast_cache()
        except Exception as e:
            log.error("migration_poll_error", cluster=cluster_name, vmid=vmid, error=str(e))


class MigratePayload(BaseModel):
    target_node: str


@router.post("/actions/{cluster}/{node}/qemu/{vmid}/migrate")
async def migrate_vm(
    cluster: str,
    node: str,
    vmid: int,
    payload: MigratePayload,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("admin", "editor")),
):
    """Execute live VM migration to a target node in the same cluster."""
    target_node = payload.target_node

    # 1. Retrieve cluster config
    cluster_config = next((c for c in CLUSTERS if c["name"] == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    # 2. Verify target node exists and is online
    cluster_cache = cache.get(cluster)
    if not cluster_cache:
        raise HTTPException(status_code=404, detail=f"Cluster cache for '{cluster}' is empty")

    nodes = cluster_cache.get("nodes", [])
    target = next((n for n in nodes if n["name"] == target_node), None)
    if not target:
        raise HTTPException(status_code=400, detail=f"Target node '{target_node}' not found in cluster '{cluster}'")
    if target["status"] != "online":
        raise HTTPException(status_code=400, detail=f"Target node '{target_node}' is offline")

    # 3. Resolve secrets (token, host)
    resolved = resolve_cluster_secrets(cluster_config)
    host = resolved["host"].rstrip("/")
    headers = {"Authorization": f"PVEAPIToken={resolved['token_id']}={resolved['token_secret']}"}
    verify_ssl = resolved.get("verify_ssl", False)

    # 4. Check if VM is running to request live migration
    is_running = False
    resources = cluster_cache.get("resources", [])
    vm = next((r for r in resources if str(r["vmid"]) == str(vmid)), None)
    if vm and vm["status"] == "running":
        is_running = True

    params = {
        "target": target_node,
    }
    if is_running:
        params["online"] = 1

    # 5. Post migration request to Proxmox VE API
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=12.0) as client:
            proxmox_url = f"{host}/api2/json/nodes/{node}/qemu/{vmid}/migrate"
            res = await client.post(proxmox_url, headers=headers, data=params)
            if res.status_code != 200:
                error_detail = res.text
                try:
                    error_detail = res.json().get("errors", res.text)
                except Exception:
                    pass
                log.error(
                    "vm_migration_failed",
                    cluster=cluster,
                    node=node,
                    vmid=vmid,
                    target_node=target_node,
                    status_code=res.status_code,
                    error=error_detail,
                    user=user["username"],
                )
                raise HTTPException(status_code=res.status_code, detail=f"Proxmox API error: {error_detail}")
    except httpx.RequestError as e:
        log.error(
            "vm_migration_network_error",
            cluster=cluster,
            node=node,
            vmid=vmid,
            target_node=target_node,
            error=str(e),
            user=user["username"],
        )
        raise HTTPException(status_code=502, detail=f"Failed to reach Proxmox host: {str(e)}") from e

    # 6. Audit log event
    log.info(
        "audit_vm_migration",
        user=user["username"],
        role=user["role"],
        cluster=cluster,
        node=node,
        vmid=vmid,
        target_node=target_node,
        status="success",
    )

    # 7. Queue background status polling to monitor node transition
    background_tasks.add_task(poll_migration_status, cluster, vmid, target_node)

    return {"status": "success", "detail": f"Migration of VM '{vmid}' to '{target_node}' initiated"}


@router.post("/actions/{cluster}/{node}/{type}/{vmid}/{action}")
async def execute_guest_action(
    cluster: str,
    node: str,
    type: str,
    vmid: int,
    action: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("admin", "editor")),
):
    """Execute VM/LXC guest power actions (start, stop, shutdown, reboot)."""
    # 1. Validate action
    if action not in ("start", "stop", "shutdown", "reboot"):
        raise HTTPException(status_code=400, detail=f"Invalid action: '{action}'")

    # 2. Normalize and validate type
    type_lower = type.lower()
    if type_lower in ("vm", "qemu"):
        pve_type = "qemu"
    elif type_lower in ("lxc",):
        pve_type = "lxc"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid resource type: '{type}'")

    # 3. Retrieve cluster config
    cluster_config = next((c for c in CLUSTERS if c["name"] == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    # 4. Resolve secrets (token, host)
    resolved = resolve_cluster_secrets(cluster_config)
    host = resolved["host"].rstrip("/")
    headers = {"Authorization": f"PVEAPIToken={resolved['token_id']}={resolved['token_secret']}"}
    verify_ssl = resolved.get("verify_ssl", False)

    # 5. Sanity check & optimistic status updates
    cluster_cache = cache.get(cluster)
    if cluster_cache:
        resources = cluster_cache.get("resources", [])
        resource = next((r for r in resources if str(r["vmid"]) == str(vmid)), None)
        if resource:
            # Update cache immediately for optimistic UI response
            if action == "start":
                resource["status"] = "running"
            elif action == "stop" or action == "shutdown":
                resource["status"] = "stopped"
            # Broadcast the updated status immediately
            from sse import broker

            await broker.broadcast_cache()

    # 6. Post action to Proxmox VE API
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=12.0) as client:
            proxmox_url = f"{host}/api2/json/nodes/{node}/{pve_type}/{vmid}/status/{action}"
            res = await client.post(proxmox_url, headers=headers)
            if res.status_code != 200:
                error_detail = res.text
                try:
                    error_detail = res.json().get("errors", res.text)
                except Exception:
                    pass
                log.error(
                    "power_action_failed",
                    cluster=cluster,
                    node=node,
                    vmid=vmid,
                    type=pve_type,
                    action=action,
                    status_code=res.status_code,
                    error=error_detail,
                    user=user["username"],
                )
                raise HTTPException(status_code=res.status_code, detail=f"Proxmox API error: {error_detail}")
    except httpx.RequestError as e:
        log.error(
            "power_action_network_error",
            cluster=cluster,
            node=node,
            vmid=vmid,
            action=action,
            error=str(e),
            user=user["username"],
        )
        raise HTTPException(status_code=502, detail=f"Failed to reach Proxmox host: {str(e)}") from e

    # 7. Audit log event
    log.info(
        "audit_power_action",
        user=user["username"],
        role=user["role"],
        cluster=cluster,
        node=node,
        vmid=vmid,
        type=type,
        action=action,
        status="success",
    )

    # 8. Queue background re-poll to fetch confirmed status from Proxmox
    background_tasks.add_task(refresh_resource_status, cluster)

    return {"status": "success", "detail": f"Action '{action}' sent successfully"}
