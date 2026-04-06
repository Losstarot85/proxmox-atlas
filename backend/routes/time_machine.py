from fastapi import APIRouter, HTTPException, Query
import httpx
from typing import Optional

router = APIRouter()
PROMETHEUS_URL = "http://proxmox-prometheus:9090"

@router.get("/time-machine/{target_id}")
async def get_time_machine_data(
    target_id: str,
    target_type: str = Query(..., description="VM o NODE"),
    start: float = Query(..., description="Timestamp inizio in sec"),
    end: float = Query(..., description="Timestamp fine in sec"),
    step: int = Query(60, description="Step in secondi per aggregazione")
):
    """Interroga Prometheus per ricavare lo storico."""
    window = max(300, step * 2)
    window_str = f"{window}s"

    # Lista delle query in base al tipo
    queries = []
    if target_type.upper() == "NODE":
        queries = [
            ("cpu", f'proxmox_node_cpu_usage_ratio{{node="{target_id}"}} * 100'),
            ("mem_used", f'proxmox_node_mem_used_bytes{{node="{target_id}"}}'),
            ("storage_used", f'sum(proxmox_node_storage_used_bytes{{node="{target_id}"}})'),
            ("storage_total", f'sum(proxmox_node_storage_total_bytes{{node="{target_id}"}})')
        ]
    else:
        # Assumiamo vmid per la validazione prometheus
        queries = [
            ("cpu", f'proxmox_vm_cpu_usage_ratio{{vmid="{target_id}"}} * 100'),
            ("mem_used", f'proxmox_vm_mem_used_bytes{{vmid="{target_id}"}}'),
            ("disk_read", f'rate(proxmox_vm_disk_read_bytes{{vmid="{target_id}"}}[{window_str}])'),
            ("disk_write", f'rate(proxmox_vm_disk_write_bytes{{vmid="{target_id}"}}[{window_str}])'),
            ("net_in", f'rate(proxmox_vm_net_in_bytes{{vmid="{target_id}"}}[{window_str}])'),
            ("net_out", f'rate(proxmox_vm_net_out_bytes{{vmid="{target_id}"}}[{window_str}])'),
        ]

    results = []
    try:
        async with httpx.AsyncClient() as client:
            for name, expr in queries:
                res = await client.get(
                    f"{PROMETHEUS_URL}/api/v1/query_range",
                    params={
                        "query": expr,
                        "start": start,
                        "end": end,
                        "step": step
                    },
                    timeout=30.0
                )
                res.raise_for_status()
                data = res.json()
                results.append({"name": name, "data": data.get("data", {}).get("result", [])})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore query Prometheus: {e}")

    # Riorganizziamo i dati in un formato compatibile con Recharts
    # Recharts vuole un array di oggetti con i timestamp allineati
    timeline = {}
    for metric in results:
        metric_name = metric["name"]
        for serie in metric["data"]:
            for point in serie.get("values", []):
                t, val = point[0], float(point[1])
                if t not in timeline:
                    timeline[t] = {"time": t}
                timeline[t][metric_name] = round(val, 2)
                
    chart_data = [timeline[t] for t in sorted(timeline.keys())]
    return {"results": chart_data}
