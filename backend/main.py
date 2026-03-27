from fastapi import FastAPI
from contextlib import asynccontextmanager
import httpx
import asyncio
from datetime import datetime
import os
from dotenv import load_dotenv

# Carica le variabili dal file .env
load_dotenv()

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

# Leggi le credenziali dall'ambiente
PROXMOX_HOST = os.getenv("PROXMOX_HOST")
TOKEN_ID = os.getenv("PROXMOX_TOKEN_ID")
TOKEN_SECRET = os.getenv("PROXMOX_TOKEN_SECRET")

HEADERS = {
    "Authorization": f"PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}"
}

# 🔹 Cache in memoria
cache = {
    "nodes": [],
    "resources": [],
    "last_update": None,
    "error": None,
    "failed_nodes": []
}


@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}


# 🔹 Fetch NODI
async def fetch_nodes_from_proxmox():
    url = f"{PROXMOX_HOST}/api2/json/nodes"

    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            response = await client.get(url, headers=HEADERS)

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

        cache["nodes"] = nodes
        cache["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cache["error"] = None

        print(f"[INFO] Nodes cache aggiornata alle {cache['last_update']}")

    except httpx.RequestError:
        cache["error"] = "Proxmox host unreachable"
        cache["nodes"] = []
        print("[ERROR] Proxmox non raggiungibile")

    except Exception as e:
        cache["error"] = str(e)
        print(f"[ERROR] {e}")


# 🔹 Fetch Risorse (VM+LXC)
async def fetch_resources_from_proxmox():
    all_resources = []
    failed_nodes = []
    resource_types = ["qemu", "lxc"]

    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            nodes = cache["nodes"]

            for node in nodes:
                node_name = node["name"]
                node_failed = False

                for r_type in resource_types:
                    try:
                        res = await client.get(
                            f"{PROXMOX_HOST}/api2/json/nodes/{node_name}/{r_type}",
                            headers=HEADERS
                        )
                        res.raise_for_status()
                        items = res.json().get("data", [])
                        for item in items:
                            all_resources.append({
                                "vmid": item.get("vmid"),
                                "name": item.get("name"),
                                "node": node_name,
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
                        print(f"[ERROR] Nodo {node_name} ({r_type}) non raggiungibile: {e}")
                        node_failed = True

                if node_failed and node_name not in failed_nodes:
                    failed_nodes.append(node_name)

        cache["resources"] = all_resources
        cache["failed_nodes"] = failed_nodes
        cache["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if failed_nodes:
            cache["error"] = f"Nodi parzialmente irraggiungibili: {', '.join(failed_nodes)}"
        else:
            cache["error"] = None

        print(f"[INFO] Risorse aggiornate: {len(all_resources)} elementi, nodi falliti: {failed_nodes}")

    except httpx.RequestError:
        cache["error"] = "Proxmox host unreachable"
        cache["resources"] = []
        cache["failed_nodes"] = []
        print("[ERROR] Proxmox non raggiungibile")

    except Exception as e:
        cache["error"] = str(e)
        cache["resources"] = []
        cache["failed_nodes"] = []
        print(f"[ERROR RESOURCES] {e}")


# 🔹 Polling continuo
async def poll_proxmox():
    while True:
        await fetch_nodes_from_proxmox()
        await fetch_resources_from_proxmox() # Chiama la funzione unificata
        await asyncio.sleep(15)


# 🔹 Endpoint NODI
@app.get("/nodes")
def get_nodes():
    return {
        "nodes": cache["nodes"],
        "last_update": cache["last_update"],
        "error": cache["error"]
    }


# 🔹 Endpoint Risorse (VM+LXC)
@app.get("/resources")
def get_resources():
    return {
        "resources": cache["resources"],
        "last_update": cache["last_update"],
        "error": cache["error"],
        "failed_nodes": cache["failed_nodes"]
    }