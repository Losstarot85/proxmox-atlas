import asyncio
import math
import os
import random
import re
import time

import httpx
from fastapi import APIRouter, HTTPException, Query

from config import is_demo_mode

router = APIRouter()
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")


def _sanitize_promql_label(value: str) -> str:
    """Strip any character that could escape a PromQL label matcher."""
    return re.sub(r"[^a-zA-Z0-9._:\-]", "", value)


# ──────────────────────────────────────────────────────────────────────
# Demo Mode Synthetic Data
# ──────────────────────────────────────────────────────────────────────


def _generate_demo_uptime(start: float, end: float, step: int = 3600) -> list[dict]:
    """Generate synthetic uptime heatmap data for demo mode."""
    heatmap = []
    t = start
    # Simulate a brief outage window ~5% of the time
    outage_center = start + (end - start) * random.uniform(0.3, 0.7)
    outage_half = random.uniform(2 * 3600, 6 * 3600)  # 2-6 hour outage

    while t <= end:
        is_up = not (outage_center - outage_half < t < outage_center + outage_half)
        heatmap.append({"time": t, "up": is_up})
        t += step
    return heatmap


def _generate_demo_time_series(start: float, end: float, step: int, target_type: str) -> list[dict]:
    """Generate synthetic time-series chart data for demo mode."""
    chart_data = []
    t = start
    base_cpu = random.uniform(15, 45)
    base_mem = random.uniform(30, 70) if target_type == "NODE" else random.uniform(20, 60)

    i = 0
    while t <= end:
        # Create realistic sinusoidal + noise patterns
        cpu = max(
            0,
            min(
                100,
                base_cpu + 15 * math.sin(i * 0.03) + 8 * math.sin(i * 0.11) + random.uniform(-3, 3),
            ),
        )
        mem_val = max(
            0,
            base_mem * (1 + 0.1 * math.sin(i * 0.02)) + random.uniform(-2, 2),
        )

        point = {"time": t, "cpu": round(cpu, 2)}

        if target_type == "NODE":
            point["mem_used"] = round(mem_val * 1024**3, 0)  # ~GB scale
            point["storage_used"] = round(random.uniform(200, 600) * 1024**3, 0)
            point["storage_total"] = round(2 * 1024**4, 0)
        else:
            point["mem_used"] = round(mem_val * 1024**2 * 100, 0)  # ~GB scale
            point["disk_read"] = round(random.uniform(0, 50) * 1024**2, 0)
            point["disk_write"] = round(random.uniform(0, 30) * 1024**2, 0)
            point["net_in"] = round(random.uniform(0, 20) * 1024**2, 0)
            point["net_out"] = round(random.uniform(0, 10) * 1024**2, 0)

        chart_data.append(point)
        t += step
        i += 1

    return chart_data


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.get("/time-machine/uptime")
async def get_uptime_history(
    target_id: str,
    target_type: str = Query(..., description="VM or NODE"),
    days: int = Query(30, description="Number of days of history"),
    target_name: str | None = Query(None, description="Explicit target name"),
):
    end = time.time()
    start = end - (days * 24 * 3600)
    step = 3600  # 1 hour

    # Demo mode: return synthetic data
    if is_demo_mode():
        return {"results": _generate_demo_uptime(start, end, step)}

    target_id = _sanitize_promql_label(target_id)
    if target_name:
        target_name = _sanitize_promql_label(target_name)

    if target_type.upper() == "NODE":
        expr = f'max_over_time(proxmox_node_uptime_seconds{{node="{target_id}"}}[1h])'
    else:
        name_filter = f',name="{target_name}"' if target_name else ""
        expr = f'max_over_time(proxmox_vm_uptime_seconds{{vmid="{target_id}"{name_filter}}}[1h])'

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{PROMETHEUS_URL}/api/v1/query_range",
                params={"query": expr, "start": start, "end": end, "step": step},
                timeout=15.0,
            )
            res.raise_for_status()
            data = res.json()

            results = data.get("data", {}).get("result", [])
            # expected format: values: [[timestamp, "value"]]

            heatmap = []
            if results and len(results) > 0:
                values = results[0].get("values", [])
                for pt in values:
                    t = pt[0]
                    try:
                        val = float(pt[1]) if pt[1] is not None else 0.0
                    except (ValueError, TypeError):
                        val = 0.0
                    is_up = val > 0
                    heatmap.append({"time": t, "up": is_up})

            return {"results": heatmap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prometheus uptime query error: {e}") from e


@router.get("/time-machine/{target_id}")
async def get_time_machine_data(
    target_id: str,
    target_type: str = Query(..., description="VM or NODE"),
    target_name: str | None = Query(None, description="Explicit VM Name to avoid cluster VS label vmid collisions"),
    start: float = Query(..., description="Start timestamp in seconds"),
    end: float = Query(..., description="End timestamp in seconds"),
    step: int = Query(60, description="Step in seconds for aggregation"),
):
    """Queries Prometheus for historical data."""

    # Demo mode: return synthetic data
    if is_demo_mode():
        return {"results": _generate_demo_time_series(start, end, step, target_type.upper())}

    window = max(300, step * 2)
    window_str = f"{window}s"

    target_id = _sanitize_promql_label(target_id)
    if target_name:
        target_name = _sanitize_promql_label(target_name)

    # Lista delle query in base al tipo
    queries = []
    if target_type.upper() == "NODE":
        queries = [
            ("cpu", f'proxmox_node_cpu_usage_ratio{{node="{target_id}"}} * 100'),
            ("mem_used", f'proxmox_node_mem_used_bytes{{node="{target_id}"}}'),
            ("storage_used", f'sum(proxmox_node_storage_used_bytes{{node="{target_id}"}})'),
            ("storage_total", f'sum(proxmox_node_storage_total_bytes{{node="{target_id}"}})'),
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

            async def _fetch_metric(name: str, expr: str):
                res = await client.get(
                    f"{PROMETHEUS_URL}/api/v1/query_range",
                    params={"query": expr, "start": start, "end": end, "step": step},
                    timeout=30.0,
                )
                res.raise_for_status()
                data = res.json()
                return {"name": name, "data": data.get("data", {}).get("result", [])}

            results = await asyncio.gather(*[_fetch_metric(n, e) for n, e in queries])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prometheus query error: {e}") from e

    # Reorganize data into a Recharts-compatible format
    # Recharts expects an array of objects with aligned timestamps
    timeline = {}
    for metric in results:
        metric_name = metric["name"]
        for serie in metric["data"]:
            for point in serie.get("values", []):
                t = point[0]
                try:
                    val = float(point[1]) if point[1] is not None else 0.0
                except (ValueError, TypeError):
                    val = 0.0
                if t not in timeline:
                    timeline[t] = {"time": t}
                timeline[t][metric_name] = round(val, 2)

    chart_data = [timeline[t] for t in sorted(timeline.keys())]
    return {"results": chart_data}
