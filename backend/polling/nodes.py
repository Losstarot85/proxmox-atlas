import httpx
from datetime import datetime
from cache import cache


async def fetch_nodes_from_proxmox(cluster: dict):
    """Recupera la lista dei nodi da un cluster Proxmox."""
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
