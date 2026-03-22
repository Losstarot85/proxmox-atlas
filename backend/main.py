from fastapi import FastAPI, HTTPException
import httpx

app = FastAPI()

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

    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            response = await client.get(url, headers=HEADERS)

        response.raise_for_status()  # 👈 errore se HTTP != 200

        raw_data = response.json().get("data", [])

        nodes = [
            {
                "name": n.get("node"),
                "status": n.get("status"),
                "type": n.get("type")
            }
            for n in raw_data
        ]

        return nodes

    except httpx.RequestError:
        # ❌ Proxmox spento / non raggiungibile
        return {
            "error": "Proxmox host unreachable",
            "nodes": []
        }

    except httpx.HTTPStatusError as e:
        # ❌ errore API Proxmox
        raise HTTPException(status_code=502, detail=str(e))

    except Exception as e:
        # ❌ qualsiasi altro errore
        raise HTTPException(status_code=500, detail=str(e))