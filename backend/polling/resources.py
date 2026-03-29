import httpx
from datetime import datetime
from cache import cache


async def fetch_resources_from_proxmox(cluster: dict):
    """Recupera VM e container LXC da tutti i nodi di un cluster."""
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    all_resources = []
    failed_nodes = []
    resource_types = ["qemu", "lxc"]

    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
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
                                "netout": item.get("netout", 0)
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
