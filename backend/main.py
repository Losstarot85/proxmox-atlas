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
    "vms": [],
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


# 🔹 Fetch VM
async def fetch_vms_from_proxmox():
    all_vms = []

    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            # recupero nodi
            nodes_res = await client.get(f"{PROXMOX_HOST}/api2/json/nodes", headers=HEADERS)
            nodes_res.raise_for_status()

            nodes = nodes_res.json().get("data", [])

            # ciclo sui nodi
            for node in nodes:
                node_name = node.get("node")

                vm_res = await client.get(
                    f"{PROXMOX_HOST}/api2/json/nodes/{node_name}/qemu",
                    headers=HEADERS
                )

                if vm_res.status_code != 200:
                    continue

                vms = vm_res.json().get("data", [])

                for vm in vms:
                    all_vms.append({
                        "name": vm.get("name"),
                        "vmid": vm.get("vmid"),
                        "node": node_name,
                        "status": vm.get("status")
                    })

        cache["vms"] = all_vms

    except Exception as e:
        print(f"[ERROR VM] {e}")


# 🔹 Polling continuo
async def poll_proxmox():
    while True:
        await fetch_nodes_from_proxmox()
        await fetch_vms_from_proxmox()
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


# 🔹 Endpoint VM
@app.get("/vms")
def get_vms():
    return {
        "vms": cache["vms"],
        "last_update": cache["last_update"],
        "error": cache["error"]
    }