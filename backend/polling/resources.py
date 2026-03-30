import httpx
import asyncio
from datetime import datetime
from cache import cache


async def fetch_resources_from_proxmox(cluster: dict):
    """Recupera VM e container LXC da tutti i nodi di un cluster."""
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

            for node in nodes:
                node_name = node["name"]
                node_failed = False

                for r_type in resource_types:
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
                                    print(f"[ERROR] [{cluster_name}] Dettagli I/O per VM {vmid}: {e}")

                            if running_vms:
                                await asyncio.gather(*(fetch_qemu_disk_io(vm) for vm in running_vms))

                        for item in items:
                            all_resources.append({
                                "vmid": item.get("vmid"),
                                "name": item.get("name"),
                                "node": node_name,
                                "cluster": cluster_name,
                                "type": "VM" if r_type == "qemu" else "LXC",
                                "status": item.get("status"),
                                "uptime": item.get("uptime"),
                                "cpu": item.get("cpu", 0.0),
                                "maxcpu": item.get("maxcpu", 1),
                                "mem": item.get("mem", 0),
                                "maxmem": item.get("maxmem", 0),
                                "netin": item.get("netin", 0),
                                "netout": item.get("netout", 0),
                                "diskread": item.get("diskread", 0),
                                "diskwrite": item.get("diskwrite", 0),
                                "pressure_cpu": float(item.get("pressurecpusome", 0)),
                                "pressure_ram": float(item.get("pressurememorysome", 0)),
                                "pressure_io": float(item.get("pressureiosome", 0))
                            })
                    except Exception as e:
                        print(f"[ERROR] [{cluster_name}] Nodo {node_name} ({r_type}): {e}")
                        node_failed = True

                if node_failed and node_name not in failed_nodes:
                    failed_nodes.append(node_name)

        cache[cluster_name]["resources"] = all_resources
        cache[cluster_name]["failed_nodes"] = failed_nodes
        cache[cluster_name]["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if failed_nodes:
            cache[cluster_name]["error"] = f"Nodi parzialmente irraggiungibili: {', '.join(failed_nodes)}"
        else:
            cache[cluster_name]["error"] = None

        print(f"[INFO] [{cluster_name}] Risorse aggiornate: {len(all_resources)} elementi, nodi falliti: {failed_nodes}")

    except httpx.RequestError:
        cache[cluster_name]["error"] = "Proxmox host unreachable"
        cache[cluster_name]["resources"] = []
        cache[cluster_name]["failed_nodes"] = []
        print(f"[ERROR] [{cluster_name}] Host non raggiungibile")

    except Exception as e:
        cache[cluster_name]["error"] = str(e)
        cache[cluster_name]["resources"] = []
        cache[cluster_name]["failed_nodes"] = []
        print(f"[ERROR RESOURCES] [{cluster_name}] {e}")
