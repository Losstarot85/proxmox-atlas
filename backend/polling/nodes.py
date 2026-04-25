import httpx
from datetime import datetime
from cache import cache
from logger import get_logger

log = get_logger("polling.nodes")

async def fetch_nodes_from_proxmox(cluster: dict):
    """Retrieves the node list from a Proxmox cluster,
    with advanced metrics fetched via RRD (IOWait, Pressure, Server Load)."""
    from config import resolve_cluster_secrets
    cluster = resolve_cluster_secrets(cluster)
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    verify_ssl = cluster.get("verify_ssl", False)
    url = f"{host}/api2/json/nodes"

    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            raw_data = response.json().get("data", [])

            nodes = []
            for n in raw_data:
                node_item = {
                    "name": n.get("node"),
                    "status": n.get("status"),
                    "type": n.get("type"),
                    "cpu": float(n.get("cpu") or 0.0),
                    "maxcpu": float(n.get("maxcpu") or 1.0),
                    "mem": float(n.get("mem") or 0.0),
                    "maxmem": float(n.get("maxmem") or 0.0),
                    "loadavg": 0.0,
                    "netin": 0,
                    "netout": 0,
                    "iowait": 0.0,
                    "pressure_cpu": 0.0,
                    "pressure_ram": 0.0,
                    "pressure_io": 0.0,
                    "uptime": n.get("uptime"),
                    "ips": [],
                    "storage_pools": []
                }

                if node_item["status"] == "online":
                    try:
                        rrd_url = f"{host}/api2/json/nodes/{node_item['name']}/rrddata?timeframe=hour"
                        rrd_res = await client.get(rrd_url, headers=headers)
                        rrd_res.raise_for_status()
                        rrd_data = rrd_res.json().get("data", [])
                        
                        if rrd_data:
                            # Take the last valid tick (ignoring null/None)
                            last_tick = next((t for t in reversed(rrd_data) if t.get("loadavg") is not None), {})
                            
                            node_item["loadavg"] = float(last_tick.get("loadavg") or 0.0)
                            node_item["netin"] = float(last_tick.get("netin") or 0.0)
                            node_item["netout"] = float(last_tick.get("netout") or 0.0)
                            node_item["iowait"] = float(last_tick.get("iowait") or 0.0)
                            node_item["pressure_cpu"] = float(last_tick.get("pressurecpusome") or 0.0)
                            node_item["pressure_ram"] = float(last_tick.get("pressurememorysome") or 0.0)
                            node_item["pressure_io"] = float(last_tick.get("pressureiosome") or 0.0)
                    except Exception as e:
                        log.warning("rrd_data_unavailable", cluster=cluster_name, node=node_item['name'], error=str(e))
                        
                    try:
                        storage_url = f"{host}/api2/json/nodes/{node_item['name']}/storage"
                        storage_res = await client.get(storage_url, headers=headers)
                        storage_res.raise_for_status()
                        storage_data = storage_res.json().get("data", [])
                        
                        for st in storage_data:
                            node_item["storage_pools"].append({
                                "storage": st.get("storage"),
                                "type": st.get("type"),
                                "active": st.get("active", 0),
                                "total": float(st.get("total") or 0.0),
                                "used": float(st.get("used") or 0.0),
                                "avail": float(st.get("avail") or 0.0)
                            })
                    except Exception as e:
                        log.warning("storage_data_unavailable", cluster=cluster_name, node=node_item['name'], error=str(e))

                    try:
                        net_url = f"{host}/api2/json/nodes/{node_item['name']}/network"
                        net_res = await client.get(net_url, headers=headers)
                        if net_res.status_code == 200:
                            net_data = net_res.json().get("data", [])
                            node_ips = []
                            for iface in net_data:
                                if iface.get("active") == 1 and iface.get("address"):
                                    node_ips.append(iface.get("address"))
                            node_item["ips"] = list(set(node_ips))
                    except Exception as e:
                        log.warning("network_data_unavailable", cluster=cluster_name, node=node_item['name'], error=str(e))

                nodes.append(node_item)

        cache[cluster_name]["nodes"] = nodes
        cache[cluster_name]["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cache[cluster_name]["error"] = None

        from metrics import NODE_CPU, NODE_MEM_TOTAL, NODE_MEM_USED, NODE_UPTIME, NODE_STORAGE_TOTAL, NODE_STORAGE_USED, NODE_STORAGE_AVAIL
        
        if "active_node_labels" not in cache[cluster_name]:
            cache[cluster_name]["active_node_labels"] = set()
        if "active_storage_labels" not in cache[cluster_name]:
            cache[cluster_name]["active_storage_labels"] = set()
            
        current_node_labels = set()
        current_storage_labels = set()

        for n in nodes:
            lbls = {"cluster": cluster_name, "node": n["name"]}
            current_node_labels.add(tuple(lbls.items()))
            
            NODE_CPU.labels(**lbls).set(n["cpu"])
            NODE_MEM_TOTAL.labels(**lbls).set(n["maxmem"])
            NODE_MEM_USED.labels(**lbls).set(n["mem"])
            if "uptime" in n:
                NODE_UPTIME.labels(**lbls).set(n["uptime"])
                
            for sp in n.get("storage_pools", []):
                if sp.get("active", 0) == 1:
                    slbls = {"cluster": cluster_name, "node": n["name"], "storage": sp["storage"]}
                    current_storage_labels.add(tuple(slbls.items()))
                    NODE_STORAGE_TOTAL.labels(**slbls).set(sp["total"])
                    NODE_STORAGE_USED.labels(**slbls).set(sp["used"])
                    NODE_STORAGE_AVAIL.labels(**slbls).set(sp["avail"])

        # Pulizia Ghost Metrics
        for labels_tuple in cache[cluster_name]["active_node_labels"] - current_node_labels:
            old_lbls = dict(labels_tuple)
            lv = (old_lbls["cluster"], old_lbls["node"])
            try:
                NODE_CPU.remove(*lv)
                NODE_MEM_TOTAL.remove(*lv)
                NODE_MEM_USED.remove(*lv)
                NODE_UPTIME.remove(*lv)
            except KeyError:
                pass
                
        for labels_tuple in cache[cluster_name]["active_storage_labels"] - current_storage_labels:
            old_lbls = dict(labels_tuple)
            lv = (old_lbls["cluster"], old_lbls["node"], old_lbls["storage"])
            try:
                NODE_STORAGE_TOTAL.remove(*lv)
                NODE_STORAGE_USED.remove(*lv)
                NODE_STORAGE_AVAIL.remove(*lv)
            except KeyError:
                pass
                
        cache[cluster_name]["active_node_labels"] = current_node_labels
        cache[cluster_name]["active_storage_labels"] = current_storage_labels
        log.info("nodes_updated", cluster=cluster_name, count=len(nodes))

    except httpx.RequestError:
        cache[cluster_name]["error"] = "Proxmox host unreachable"
        cache[cluster_name]["nodes"] = []
        log.error("host_unreachable", cluster=cluster_name)

    except Exception as e:
        cache[cluster_name]["error"] = str(e)
        log.error("nodes_polling_error", cluster=cluster_name, error=str(e))
