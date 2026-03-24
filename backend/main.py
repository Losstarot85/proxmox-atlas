from fastapi import FastAPI
import httpx
import asyncio
from datetime import datetime
import os
from dotenv import load_dotenv

# Carica le variabili dal file .env
load_dotenv()

app = FastAPI()

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
    "resources": [], # Qui finiranno sia VM che LXC
    "last_update": None,
    "error": None
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
    resource_types = ["qemu", "lxc"] # Tipi di risorse da monitorare

    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            # Recuperiamo prima i nodi per sapere dove cercare
            nodes_res = await client.get(f"{PROXMOX_HOST}/api2/json/nodes", headers=HEADERS)
            nodes_res.raise_for_status()
            nodes = nodes_res.json().get("data", [])

            for node in nodes:
                node_name = node.get("node")
                
                for r_type in resource_types:
                    res = await client.get(
                        f"{PROXMOX_HOST}/api2/json/nodes/{node_name}/{r_type}",
                        headers=HEADERS
                    )
                    
                    if res.status_code == 200:
                        items = res.json().get("data", [])
                        for item in items:
                            all_resources.append({
                                "vmid": item.get("vmid"),
                                "name": item.get("name"),
                                "node": node_name,
                                "type": "VM" if r_type == "qemu" else "LXC",
                                "status": item.get("status"),
                                "uptime": item.get("uptime"),
                                # 🔹 NUOVI CAMPI PER LE METRICHE
                                "cpu": item.get("cpu", 0.0),
                                "maxcpu": item.get("maxcpu", 1),
                                "mem": item.get("mem", 0),
                                "maxmem": item.get("maxmem", 0),
                                "netin": item.get("netin", 0),
                                "netout": item.get("netout", 0)
                            })
        
        cache["resources"] = all_resources
        cache["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[INFO] Risorse aggiornate: {len(all_resources)} elementi totali")

    except Exception as e:
        print(f"[ERROR RESOURCES] {e}")
        cache["error"] = str(e)


# 🔹 Polling continuo
async def poll_proxmox():
    while True:
        await fetch_nodes_from_proxmox()
        await fetch_resources_from_proxmox() # Chiama la funzione unificata
        await asyncio.sleep(15)


# 🔹 Startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(poll_proxmox())


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
        "error": cache["error"]
    }