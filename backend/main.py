from fastapi import FastAPI
import httpx

app = FastAPI()

# CONFIG (per ora hardcoded - miglioreremo dopo)
PROXMOX_HOST = "https://192.168.1.207:8006"
TOKEN_ID = "root@pam!atlas"
TOKEN_SECRET = "0325379d-fc1d-45a3-a39b-d7e3d9e8a6ca"

HEADERS = {
    "Authorization": f"PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}"
}

@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}

@app.get("/nodes")
async def get_nodes():
    url = f"{PROXMOX_HOST}/api2/json/nodes"

    async with httpx.AsyncClient(verify=False) as client:
        response = await client.get(url, headers=HEADERS)

    raw_data = response.json()["data"]

    nodes = []

    for n in raw_data:
        nodes.append({
            "name": n["node"],
            "status": n["status"],
            "type": n["type"]
        })

    return nodes