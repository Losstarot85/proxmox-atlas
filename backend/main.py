from fastapi import FastAPI, HTTPException
import httpx
import asyncio
from datetime import datetime

app = FastAPI()

PROXMOX_HOST = "https://192.168.1.207:8006"
TOKEN_ID = "root@pam!atlas"
TOKEN_SECRET = "0325379d-fc1d-45a3-a39b-d7e3d9e8a6ca"

HEADERS = {
    "Authorization": f"PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}"
}

# 🔹 Cache in memoria
cache = {
    "nodes": [],
    "last_update": None,
    "error": None
}


@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}


# 🔹 Funzione che interroga Proxmox
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

        print(f"[INFO] Cache aggiornata alle {cache['last_update']}")

    except httpx.RequestError:
        cache["error"] = "Proxmox host unreachable"
        cache["nodes"] = []
        print("[ERROR] Proxmox non raggiungibile")

    except Exception as e:
        cache["error"] = str(e)
        print(f"[ERROR] {e}")


# 🔹 Polling continuo
async def poll_proxmox():
    while True:
        await fetch_nodes_from_proxmox()
        await asyncio.sleep(30)  # ogni 30 secondi


# 🔹 Avvio automatico polling
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(poll_proxmox())


# 🔹 Endpoint che legge SOLO la cache
@app.get("/nodes")
def get_nodes():
    return {
        "nodes": cache["nodes"],
        "last_update": cache["last_update"],
        "error": cache["error"]
    }