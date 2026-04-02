import httpx
from datetime import datetime
from cache import cache

async def fetch_nodes_from_proxmox(cluster: dict):
    """Recupera la lista dei nodi da un cluster Proxmox, 
    con metriche avanzate pescate tramite RRD (IOWait, Pressure, Server Load)."""
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
                    "uptime": n.get("uptime")
                }

                if node_item["status"] == "online":
                    try:
                        rrd_url = f"{host}/api2/json/nodes/{node_item['name']}/rrddata?timeframe=hour"
                        rrd_res = await client.get(rrd_url, headers=headers)
                        rrd_res.raise_for_status()
                        rrd_data = rrd_res.json().get("data", [])
                        
                        if rrd_data:
                            # Prende l'ultimo tick valido (ignorando i null/None)
                            last_tick = next((t for t in reversed(rrd_data) if t.get("loadavg") is not None), {})
                            
                            node_item["loadavg"] = float(last_tick.get("loadavg") or 0.0)
                            node_item["netin"] = float(last_tick.get("netin") or 0.0)
                            node_item["netout"] = float(last_tick.get("netout") or 0.0)
                            node_item["iowait"] = float(last_tick.get("iowait") or 0.0)
                            node_item["pressure_cpu"] = float(last_tick.get("pressurecpusome") or 0.0)
                            node_item["pressure_ram"] = float(last_tick.get("pressurememorysome") or 0.0)
                            node_item["pressure_io"] = float(last_tick.get("pressureiosome") or 0.0)
                    except Exception as e:
                        print(f"[WARN] [{cluster_name}] RRD data non disponibile per nodo {node_item['name']}: {e}")

                nodes.append(node_item)

        cache[cluster_name]["nodes"] = nodes
        cache[cluster_name]["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cache[cluster_name]["error"] = None

        from metrics import NODE_CPU, NODE_MEM_TOTAL, NODE_MEM_USED, NODE_UPTIME
        
        if "active_node_labels" not in cache[cluster_name]:
            cache[cluster_name]["active_node_labels"] = set()
            
        current_node_labels = set()

        for n in nodes:
            lbls = {"cluster": cluster_name, "node": n["name"]}
            current_node_labels.add(tuple(lbls.items()))
            
            NODE_CPU.labels(**lbls).set(n["cpu"])
            NODE_MEM_TOTAL.labels(**lbls).set(n["maxmem"])
            NODE_MEM_USED.labels(**lbls).set(n["mem"])
            if "uptime" in n:
                NODE_UPTIME.labels(**lbls).set(n["uptime"])

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
                
        cache[cluster_name]["active_node_labels"] = current_node_labels
        print(f"[INFO] [{cluster_name}] Nodes aggiornati: {len(nodes)} nodi")

    except httpx.RequestError:
        cache[cluster_name]["error"] = "Proxmox host unreachable"
        cache[cluster_name]["nodes"] = []
        print(f"[ERROR] [{cluster_name}] Host non raggiungibile")

    except Exception as e:
        cache[cluster_name]["error"] = str(e)
        print(f"[ERROR] [{cluster_name}] {e}")
