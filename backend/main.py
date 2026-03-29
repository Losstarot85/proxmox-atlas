from fastapi import FastAPI
from contextlib import asynccontextmanager
import httpx
import asyncio
from datetime import datetime
import os
import json


# Carica la configurazione dei cluster
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "clusters.json")

try:
    with open(CONFIG_PATH) as f:
        CLUSTERS = json.load(f)
except FileNotFoundError:
    print("[FATAL] clusters.json non trovato!")
    print(f"  Copia clusters.json.example in clusters.json e configuralo:")
    print(f"  cp {CONFIG_PATH}.example {CONFIG_PATH}")
    raise SystemExit(1)
except json.JSONDecodeError as e:
    print(f"[FATAL] clusters.json contiene JSON non valido: {e}")
    raise SystemExit(1)

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(poll_proxmox())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan)


# Cache in memoria
cache = {
    cluster["name"]: {
        "nodes": [],
        "resources": [],
        "last_update": None,
        "error": None,
        "failed_nodes": []
    }
    for cluster in CLUSTERS
}


@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}


# Fetch NODI
async def fetch_nodes_from_proxmox(cluster: dict):
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    url = f"{host}/api2/json/nodes"

    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            response = await client.get(url, headers=headers)

        response.raise_for_status()

        raw_data = response.json().get("data", [])

        nodes = [
            {
                "name": n.get("node"),
                "status": n.get("status"),
                "type": n.get("type")
            }
            for n in raw_data
        ]

        cache[cluster_name]["nodes"] = nodes
        cache[cluster_name]["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cache[cluster_name]["error"] = None

        print(f"[INFO] [{cluster_name}] Nodes aggiornati: {len(nodes)} nodi")

    except httpx.RequestError:
        cache[cluster_name]["error"] = "Proxmox host unreachable"
        cache[cluster_name]["nodes"] = []
        print(f"[ERROR] [{cluster_name}] Host non raggiungibile")

    except Exception as e:
        cache[cluster_name]["error"] = str(e)
        print(f"[ERROR] [{cluster_name}] {e}")


# Fetch Risorse (VM+LXC)
async def fetch_resources_from_proxmox(cluster: dict):
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


# Fetch Network
async def fetch_ips_for_resource(client: httpx.AsyncClient, resource: dict, host: str, headers: dict) -> dict:
    node = resource["node"]
    vmid = resource["vmid"]
    r_type = resource["type"]
    name = resource["name"]

    result = {
        "vmid": vmid,
        "name": name,
        "node": node,
        "cluster": resource["cluster"],
        "type": r_type,
        "agent_available": False,
        "ips": []
    }

    try:
        if r_type == "VM":
            url = f"{host}/api2/json/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces"
            res = await client.get(url, headers=headers, timeout=3.0)
            res.raise_for_status()
            interfaces = res.json().get("data", {}).get("result", [])
            result["agent_available"] = True

            for iface in interfaces:
                if iface.get("name") == "lo":
                    continue
                for ip_info in iface.get("ip-addresses", []):
                    if ip_info.get("ip-address-type") == "ipv4":
                        result["ips"].append({
                            "interface": iface.get("name"),
                            "ip": ip_info.get("ip-address"),
                            "prefix": ip_info.get("prefix")
                        })

        elif r_type == "LXC":
            url = f"{host}/api2/json/nodes/{node}/lxc/{vmid}/interfaces"
            res = await client.get(url, headers=headers, timeout=3.0)
            res.raise_for_status()
            interfaces = res.json().get("data", [])
            result["agent_available"] = True

            for iface in interfaces:
                if iface.get("name") == "lo":
                    continue
                inet = iface.get("inet", "")
                if inet:
                    ip = inet.split("/")[0]
                    prefix = inet.split("/")[1] if "/" in inet else None
                    result["ips"].append({
                        "interface": iface.get("name"),
                        "ip": ip,
                        "prefix": prefix
                    })

    except httpx.TimeoutException:
        result["agent_available"] = False
    except Exception:
        result["agent_available"] = False

    return result


# Polling continuo
async def poll_proxmox():
    while True:
        await asyncio.gather(*[
            poll_cluster(cluster) for cluster in CLUSTERS
        ])
        await asyncio.sleep(15)


async def poll_cluster(cluster: dict):
    await fetch_nodes_from_proxmox(cluster)
    await fetch_resources_from_proxmox(cluster)


# Endpoint NODI
@app.get("/nodes")
def get_nodes():
    return {
        "clusters": [
            {
                "name": cluster_name,
                "nodes": data["nodes"],
                "last_update": data["last_update"],
                "error": data["error"]
            }
            for cluster_name, data in cache.items()
        ]
    }


# Endpoint Risorse (VM+LXC)
@app.get("/resources")
def get_resources():
    return {
        "clusters": [
            {
                "name": cluster_name,
                "resources": data["resources"],
                "last_update": data["last_update"],
                "error": data["error"],
                "failed_nodes": data["failed_nodes"]
            }
            for cluster_name, data in cache.items()
        ]
    }


# Endpoint Network
@app.get("/network")
async def get_network():
    results_by_cluster = []

    for cluster in CLUSTERS:
        cluster_name = cluster["name"]
        host = cluster["host"]
        headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}

        running_resources = [
            r for r in cache[cluster_name]["resources"]
            if r["status"] == "running"
        ]

        async with httpx.AsyncClient(verify=False) as client:
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