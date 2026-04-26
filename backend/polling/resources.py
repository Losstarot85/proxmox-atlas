import asyncio
from datetime import datetime

import httpx

from cache import cache
from logger import get_logger

log = get_logger("polling.resources")


async def fetch_resources_from_proxmox(cluster: dict):
    """Retrieves VMs and LXC containers from all nodes of a cluster."""
    from config import resolve_cluster_secrets
    cluster = resolve_cluster_secrets(cluster)
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    verify_ssl = cluster.get("verify_ssl", False)
    all_resources = []
    failed_nodes = []
    resource_types = ["qemu", "lxc"]

    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0) as client:
            nodes = cache[cluster_name]["nodes"]

            pool_by_vmid = {}
            try:
                cluster_res = await client.get(
                    f"{host}/api2/json/cluster/resources",
                    headers=headers
                )
                if cluster_res.status_code == 200:
                    cdata = cluster_res.json().get("data", [])
                    for i in cdata:
                        if i.get("type") in ["qemu", "lxc"] and "vmid" in i:
                            pool_by_vmid[i["vmid"]] = i.get("pool", "")
            except Exception as e:
                log.warning("pool_fetch_failed", cluster=cluster_name, error=str(e))

            async def fetch_node_resources(node_name, r_type):
                try:
                    res = await client.get(
                        f"{host}/api2/json/nodes/{node_name}/{r_type}",
                        headers=headers
                    )
                    res.raise_for_status()
                    items = res.json().get("data", [])

                    if r_type == "qemu":
                        running_vms = [item for item in items if item.get("status") == "running"]
                        async def fetch_qemu_disk_io(vm_item):
                            try:
                                vmid = vm_item.get("vmid")
                                status_res = await client.get(
                                    f"{host}/api2/json/nodes/{node_name}/qemu/{vmid}/status/current",
                                    headers=headers
                                )
                                status_res.raise_for_status()
                                status_data = status_res.json().get("data", {})
                                vm_item["diskread"] = status_data.get("diskread", 0)
                                vm_item["diskwrite"] = status_data.get("diskwrite", 0)
                            except Exception as e:
                                log.error("vm_io_detail_failed", cluster=cluster_name, vmid=vmid, error=str(e))

                        if running_vms:
                            await asyncio.gather(*(fetch_qemu_disk_io(vm) for vm in running_vms))

                    return {"node_name": node_name, "r_type": r_type, "items": items, "error": None}
                except Exception as e:
                    return {"node_name": node_name, "r_type": r_type, "items": [], "error": str(e)}

            tasks = []
            for node in nodes:
                node_name = node["name"]
                for r_type in resource_types:
                    tasks.append(fetch_node_resources(node_name, r_type))

            results = await asyncio.gather(*tasks)

            for r in results:
                node_name = r["node_name"]
                if r["error"]:
                    log.error("node_resources_failed", cluster=cluster_name, node=node_name, type=r['r_type'], error=r['error'])
                    if node_name not in failed_nodes:
                        failed_nodes.append(node_name)
                else:
                    for item in r["items"]:
                        all_resources.append({
                            "vmid": item.get("vmid"),
                            "name": item.get("name"),
                            "node": node_name,
                            "cluster": cluster_name,
                            "type": "VM" if r["r_type"] == "qemu" else "LXC",
                            "tags": item.get("tags", ""),
                            "pool": pool_by_vmid.get(item.get("vmid"), ""),
                            "status": item.get("status"),
                            "uptime": item.get("uptime"),
                            "cpu": float(item.get("cpu") or 0.0),
                            "maxcpu": float(item.get("maxcpu") or 1.0),
                            "mem": float(item.get("mem") or 0.0),
                            "maxmem": float(item.get("maxmem") or 0.0),
                            "netin": float(item.get("netin") or 0.0),
                            "netout": float(item.get("netout") or 0.0),
                            "diskread": float(item.get("diskread") or 0.0),
                            "diskwrite": float(item.get("diskwrite") or 0.0),
                            "pressure_cpu": float(item.get("pressurecpusome") or 0.0),
                            "pressure_ram": float(item.get("pressurememorysome") or 0.0),
                            "pressure_io": float(item.get("pressureiosome") or 0.0)
                        })

        cache[cluster_name]["resources"] = all_resources
        cache[cluster_name]["failed_nodes"] = failed_nodes
        cache[cluster_name]["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        from metrics import (
            VM_CPU,
            VM_DISK_READ,
            VM_DISK_WRITE,
            VM_MEM_TOTAL,
            VM_MEM_USED,
            VM_NET_IN,
            VM_NET_OUT,
            VM_UPTIME,
        )

        if "active_vm_labels" not in cache[cluster_name]:
            cache[cluster_name]["active_vm_labels"] = set()

        current_vm_labels = set()

        for r in all_resources:
            lbls = {"cluster": cluster_name, "node": r["node"], "vmid": str(r["vmid"]), "type": r["type"], "name": r["name"]}
            current_vm_labels.add(tuple(lbls.items()))

            VM_CPU.labels(**lbls).set(r["cpu"])
            VM_MEM_TOTAL.labels(**lbls).set(r["maxmem"])
            VM_MEM_USED.labels(**lbls).set(r["mem"])
            VM_DISK_READ.labels(**lbls).set(r["diskread"])
            VM_DISK_WRITE.labels(**lbls).set(r["diskwrite"])
            VM_NET_IN.labels(**lbls).set(r["netin"])
            VM_NET_OUT.labels(**lbls).set(r["netout"])
            if r.get("uptime") is not None:
                VM_UPTIME.labels(**lbls).set(r["uptime"])

        # Pulizia Ghost Metrics
        for labels_tuple in cache[cluster_name]["active_vm_labels"] - current_vm_labels:
            old_lbls = dict(labels_tuple)
            lv = (old_lbls["cluster"], old_lbls["node"], old_lbls["vmid"], old_lbls["type"], old_lbls["name"])
            try:
                VM_CPU.remove(*lv)
                VM_MEM_TOTAL.remove(*lv)
                VM_MEM_USED.remove(*lv)
                VM_DISK_READ.remove(*lv)
                VM_DISK_WRITE.remove(*lv)
                VM_NET_IN.remove(*lv)
                VM_NET_OUT.remove(*lv)
                VM_UPTIME.remove(*lv)
            except KeyError:
                pass

        cache[cluster_name]["active_vm_labels"] = current_vm_labels

        cache[cluster_name]["resource_error"] = None

        log.info("resources_updated", cluster=cluster_name, count=len(all_resources), failed_nodes=failed_nodes)

    except httpx.RequestError:
        cache[cluster_name]["resource_error"] = "Proxmox host unreachable"
        cache[cluster_name]["resources"] = []
        cache[cluster_name]["failed_nodes"] = []
        log.error("host_unreachable", cluster=cluster_name)

    except Exception as e:
        cache[cluster_name]["resource_error"] = str(e)
        cache[cluster_name]["resources"] = []
        cache[cluster_name]["failed_nodes"] = []
        log.error("resources_polling_error", cluster=cluster_name, error=str(e))
