from fastapi import APIRouter, HTTPException, Query
import httpx
from typing import Optional
import os

router = APIRouter()
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")

@router.get("/time-machine/uptime")
async def get_uptime_history(
    target_id: str,
    target_type: str = Query(..., description="VM or NODE"),
    days: int = Query(30, description="Number of days of history"),
):
    import time
    end = time.time()
    start = end - (days * 24 * 3600)
    step = 3600  # 1 hour
    
    if target_type.upper() == "NODE":
        expr = f'max_over_time(proxmox_node_uptime_seconds{{node="{target_id}"}}[1h])'
    else:
        expr = f'max_over_time(proxmox_vm_uptime_seconds{{vmid="{target_id}"}}[1h])'
        
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{PROMETHEUS_URL}/api/v1/query_range",
                params={
                    "query": expr,
                    "start": start,
                    "end": end,
                    "step": step
                },
                timeout=15.0
            )
            res.raise_for_status()
            data = res.json()
            
            results = data.get("data", {}).get("result", [])
            # expected format: values: [[timestamp, "value"]]
            
            heatmap = []
            if results and len(results) > 0:
                values = results[0].get("values", [])
                for pt in values:
                    t, val = pt[0], float(pt[1])
                    is_up = val > 0
                    heatmap.append({"time": t, "up": is_up})
            
            return {"results": heatmap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prometheus uptime query error: {e}")

@router.get("/time-machine/{target_id}")
async def get_time_machine_data(
    target_id: str,
    target_type: str = Query(..., description="VM or NODE"),
    target_name: Optional[str] = Query(None, description="Explicit VM Name to avoid cluster VS label vmid collisions"),
    start: float = Query(..., description="Start timestamp in seconds"),
    end: float = Query(..., description="End timestamp in seconds"),
    step: int = Query(60, description="Step in seconds for aggregation")
):
    """Queries Prometheus for historical data."""
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
        name_filter = f',name="{target_name}"' if target_name else ""
        # Assumiamo vmid per la validazione prometheus
        queries = [
            ("cpu", f'proxmox_vm_cpu_usage_ratio{{vmid="{target_id}"{name_filter}}} * 100'),
            ("mem_used", f'proxmox_vm_mem_used_bytes{{vmid="{target_id}"{name_filter}}}'),
            ("disk_read", f'rate(proxmox_vm_disk_read_bytes{{vmid="{target_id}"{name_filter}}}[{window_str}])'),
            ("disk_write", f'rate(proxmox_vm_disk_write_bytes{{vmid="{target_id}"{name_filter}}}[{window_str}])'),
            ("net_in", f'rate(proxmox_vm_net_in_bytes{{vmid="{target_id}"{name_filter}}}[{window_str}])'),
            ("net_out", f'rate(proxmox_vm_net_out_bytes{{vmid="{target_id}"{name_filter}}}[{window_str}])'),
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
        raise HTTPException(status_code=500, detail=f"Prometheus query error: {e}")

    # Reorganize data into a Recharts-compatible format
    # Recharts expects an array of objects with aligned timestamps
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

