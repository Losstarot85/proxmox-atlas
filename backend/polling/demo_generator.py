"""
Synthetic Demo Data Generator for Proxmox Atlas.

Generates realistic mock Proxmox VE cluster data for live demos,
allowing potential users to explore Atlas without a real Proxmox deployment.

Produces 2 clusters with nodes, VMs, LXCs, metrics history, backups, and alerts.
Values fluctuate slightly each tick to simulate live monitoring.
"""

import math
import random
import time

from logger import get_logger

log = get_logger("demo_generator")

# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────

HISTORY_LENGTH = 40  # sparkline data points

_PROD_NODES = [
    {
        "node": "pve-prod-01",
        "maxcpu": 32,
        "maxmem": 128 * 1024**3,
        "maxdisk": 2 * 1024**4,
        "base_cpu": 0.35,
        "base_mem_pct": 0.62,
    },
    {
        "node": "pve-prod-02",
        "maxcpu": 32,
        "maxmem": 128 * 1024**3,
        "maxdisk": 2 * 1024**4,
        "base_cpu": 0.42,
        "base_mem_pct": 0.71,
    },
    {
        "node": "pve-prod-03",
        "maxcpu": 16,
        "maxmem": 64 * 1024**3,
        "maxdisk": 1 * 1024**4,
        "base_cpu": 0.28,
        "base_mem_pct": 0.55,
    },
]

_DEV_NODES = [
    {
        "node": "pve-dev-01",
        "maxcpu": 16,
        "maxmem": 64 * 1024**3,
        "maxdisk": 1 * 1024**4,
        "base_cpu": 0.18,
        "base_mem_pct": 0.40,
    },
    {
        "node": "pve-dev-02",
        "maxcpu": 8,
        "maxmem": 32 * 1024**3,
        "maxdisk": 512 * 1024**3,
        "base_cpu": 0.12,
        "base_mem_pct": 0.35,
    },
]

_PROD_RESOURCES = [
    {
        "vmid": 100,
        "name": "k8s-control-plane",
        "type": "VM",
        "node": "pve-prod-01",
        "maxcpu": 4,
        "maxmem": 8 * 1024**3,
        "status": "running",
        "tags": "kubernetes,production",
        "pool": "kubernetes",
        "base_cpu": 0.15,
        "base_mem_pct": 0.45,
    },
    {
        "vmid": 101,
        "name": "k8s-worker-01",
        "type": "VM",
        "node": "pve-prod-01",
        "maxcpu": 8,
        "maxmem": 16 * 1024**3,
        "status": "running",
        "tags": "kubernetes,production",
        "pool": "kubernetes",
        "base_cpu": 0.55,
        "base_mem_pct": 0.68,
    },
    {
        "vmid": 102,
        "name": "k8s-worker-02",
        "type": "VM",
        "node": "pve-prod-02",
        "maxcpu": 8,
        "maxmem": 16 * 1024**3,
        "status": "running",
        "tags": "kubernetes,production",
        "pool": "kubernetes",
        "base_cpu": 0.48,
        "base_mem_pct": 0.62,
    },
    {
        "vmid": 200,
        "name": "postgres-primary",
        "type": "VM",
        "node": "pve-prod-02",
        "maxcpu": 4,
        "maxmem": 32 * 1024**3,
        "status": "running",
        "tags": "database,production",
        "pool": "databases",
        "base_cpu": 0.30,
        "base_mem_pct": 0.78,
    },
    {
        "vmid": 201,
        "name": "postgres-replica",
        "type": "VM",
        "node": "pve-prod-03",
        "maxcpu": 4,
        "maxmem": 16 * 1024**3,
        "status": "running",
        "tags": "database,production",
        "pool": "databases",
        "base_cpu": 0.12,
        "base_mem_pct": 0.55,
    },
    {
        "vmid": 300,
        "name": "redis-cache",
        "type": "LXC",
        "node": "pve-prod-01",
        "maxcpu": 2,
        "maxmem": 4 * 1024**3,
        "status": "running",
        "tags": "cache,production",
        "pool": "services",
        "base_cpu": 0.08,
        "base_mem_pct": 0.60,
    },
    {
        "vmid": 301,
        "name": "nginx-ingress",
        "type": "LXC",
        "node": "pve-prod-02",
        "maxcpu": 2,
        "maxmem": 2 * 1024**3,
        "status": "running",
        "tags": "web,production",
        "pool": "services",
        "base_cpu": 0.22,
        "base_mem_pct": 0.35,
    },
    {
        "vmid": 302,
        "name": "monitoring-stack",
        "type": "LXC",
        "node": "pve-prod-03",
        "maxcpu": 2,
        "maxmem": 4 * 1024**3,
        "status": "running",
        "tags": "monitoring,production",
        "pool": "services",
        "base_cpu": 0.18,
        "base_mem_pct": 0.52,
    },
    {
        "vmid": 900,
        "name": "win-legacy-app",
        "type": "VM",
        "node": "pve-prod-03",
        "maxcpu": 2,
        "maxmem": 4 * 1024**3,
        "status": "stopped",
        "tags": "legacy,windows",
        "pool": "",
        "base_cpu": 0.0,
        "base_mem_pct": 0.0,
    },
]

_DEV_RESOURCES = [
    {
        "vmid": 500,
        "name": "staging-api",
        "type": "VM",
        "node": "pve-dev-01",
        "maxcpu": 4,
        "maxmem": 8 * 1024**3,
        "status": "running",
        "tags": "staging,api",
        "pool": "staging",
        "base_cpu": 0.10,
        "base_mem_pct": 0.38,
    },
    {
        "vmid": 501,
        "name": "gitlab-runner",
        "type": "VM",
        "node": "pve-dev-01",
        "maxcpu": 4,
        "maxmem": 8 * 1024**3,
        "status": "running",
        "tags": "ci-cd,development",
        "pool": "ci",
        "base_cpu": 0.35,
        "base_mem_pct": 0.50,
    },
    {
        "vmid": 502,
        "name": "dev-database",
        "type": "LXC",
        "node": "pve-dev-02",
        "maxcpu": 2,
        "maxmem": 4 * 1024**3,
        "status": "running",
        "tags": "database,development",
        "pool": "staging",
        "base_cpu": 0.06,
        "base_mem_pct": 0.42,
    },
    {
        "vmid": 503,
        "name": "test-sandbox",
        "type": "VM",
        "node": "pve-dev-02",
        "maxcpu": 2,
        "maxmem": 4 * 1024**3,
        "status": "stopped",
        "tags": "testing",
        "pool": "staging",
        "base_cpu": 0.0,
        "base_mem_pct": 0.0,
    },
]

_IP_MAP = {
    100: ["10.10.1.10"],
    101: ["10.10.1.11"],
    102: ["10.10.1.12"],
    200: ["10.10.2.20"],
    201: ["10.10.2.21"],
    300: ["10.10.3.30"],
    301: ["10.10.3.31"],
    302: ["10.10.3.32"],
    500: ["10.20.1.50"],
    501: ["10.20.1.51"],
    502: ["10.20.1.52"],
}

# ──────────────────────────────────────────────────────────────────────
# Internal state — metrics history accumulates over ticks
# ──────────────────────────────────────────────────────────────────────

_metrics_history: dict[str, dict[str, list[float]]] = {}
_tick_counter = 0


def _jitter(base: float, amplitude: float = 0.05) -> float:
    """Add sinusoidal + random jitter to a base value, clamped 0–1."""
    global _tick_counter
    sin_component = math.sin(_tick_counter * 0.15 + base * 10) * amplitude
    rand_component = random.uniform(-amplitude * 0.5, amplitude * 0.5)
    return max(0.0, min(1.0, base + sin_component + rand_component))


def _build_node(template: dict) -> dict:
    """Build a realistic node dict from a template with live jitter."""
    cpu_frac = _jitter(template["base_cpu"], 0.06)
    mem_pct = _jitter(template["base_mem_pct"], 0.03)
    mem_used = int(template["maxmem"] * mem_pct)
    disk_used = int(template["maxdisk"] * random.uniform(0.30, 0.55))

    return {
        "node": template["node"],
        "status": "online",
        "maxcpu": template["maxcpu"],
        "cpu": cpu_frac,
        "maxmem": template["maxmem"],
        "mem": mem_used,
        "maxdisk": template["maxdisk"],
        "disk": disk_used,
        "uptime": int(time.time()) - random.randint(86400 * 5, 86400 * 90),
        "pressure_cpu": round(_jitter(3.0 / 100, 0.02) * 100, 2),
        "pressure_ram": round(_jitter(2.0 / 100, 0.015) * 100, 2),
        "pressure_io": round(_jitter(1.5 / 100, 0.01) * 100, 2),
    }


def _build_resource(template: dict, cluster_name: str) -> dict:
    """Build a realistic resource (VM/LXC) dict from a template."""
    is_running = template["status"] == "running"
    cpu_frac = _jitter(template["base_cpu"], 0.08) if is_running else 0.0
    mem_pct = _jitter(template["base_mem_pct"], 0.04) if is_running else 0.0
    mem_used = int(template["maxmem"] * mem_pct) if is_running else 0

    # Update metrics history
    key = f"{cluster_name}-{template['type']}-{template['vmid']}"
    if key not in _metrics_history:
        _metrics_history[key] = {
            "cpu": [round(_jitter(template["base_cpu"], 0.08) * 100, 1) for _ in range(HISTORY_LENGTH)]
            if is_running
            else [],
            "ram": [round(_jitter(template["base_mem_pct"], 0.04) * 100, 1) for _ in range(HISTORY_LENGTH)]
            if is_running
            else [],
        }
    else:
        hist = _metrics_history[key]
        if is_running:
            hist["cpu"].append(round(cpu_frac * 100, 1))
            hist["ram"].append(round(mem_pct * 100, 1))
            if len(hist["cpu"]) > HISTORY_LENGTH:
                hist["cpu"] = hist["cpu"][-HISTORY_LENGTH:]
            if len(hist["ram"]) > HISTORY_LENGTH:
                hist["ram"] = hist["ram"][-HISTORY_LENGTH:]

    netin = int(random.uniform(50_000, 5_000_000)) if is_running else 0
    netout = int(random.uniform(20_000, 2_000_000)) if is_running else 0

    return {
        "vmid": template["vmid"],
        "name": template["name"],
        "type": template["type"],
        "node": template["node"],
        "status": template["status"],
        "maxcpu": template["maxcpu"],
        "cpu": cpu_frac,
        "maxmem": template["maxmem"],
        "mem": mem_used,
        "netin": netin,
        "netout": netout,
        "diskread": int(random.uniform(1_000, 500_000)) if is_running else 0,
        "diskwrite": int(random.uniform(1_000, 300_000)) if is_running else 0,
        "uptime": int(time.time()) - random.randint(3600, 86400 * 30) if is_running else 0,
        "tags": template.get("tags", ""),
        "pool": template.get("pool", ""),
        "ips": _IP_MAP.get(template["vmid"], []),
        "pressure_cpu": round(_jitter(2.0 / 100, 0.015) * 100, 2) if is_running else 0,
        "pressure_ram": round(_jitter(1.5 / 100, 0.01) * 100, 2) if is_running else 0,
        "pressure_io": round(_jitter(1.0 / 100, 0.008) * 100, 2) if is_running else 0,
    }


def _build_backup_data(cluster_name: str, resources: list[dict]) -> dict:
    """Generate synthetic backup data for a cluster."""
    now = int(time.time())
    backups = []

    for r in resources:
        if r["status"] != "running":
            continue

        # Most resources have recent backups, a couple are stale
        is_stale = r["vmid"] in (900, 503)
        last_backup_age = random.randint(86400 * 10, 86400 * 30) if is_stale else random.randint(3600, 86400 * 2)
        backup_time = now - last_backup_age

        backups.append(
            {
                "vmid": r["vmid"],
                "name": r["name"],
                "type": r["type"],
                "node": r["node"],
                "volid": f"local:backup/vzdump-{r['type'].lower()}-{r['vmid']}-{backup_time}.vma.zst",
                "ctime": backup_time,
                "size": random.randint(500_000_000, 50_000_000_000),
            }
        )

    return {
        "cluster": cluster_name,
        "backups": backups,
    }


# ──────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────


def generate_demo_data() -> dict:
    """Generate a full snapshot of synthetic demo cluster data.

    Returns a dict keyed by cluster name, each containing:
      { "name", "nodes", "resources", "backups" }

    Also updates internal metrics history for sparklines.
    """
    global _tick_counter
    _tick_counter += 1

    clusters = {}

    # ── Production Cluster ──
    prod_name = "pve-prod-cluster"
    prod_nodes = [_build_node(t) for t in _PROD_NODES]
    prod_resources = [_build_resource(t, prod_name) for t in _PROD_RESOURCES]
    prod_backups = _build_backup_data(prod_name, prod_resources)
    clusters[prod_name] = {
        "name": prod_name,
        "nodes": prod_nodes,
        "resources": prod_resources,
        "backups": prod_backups,
    }

    # ── Dev Cluster ──
    dev_name = "pve-dev-cluster"
    dev_nodes = [_build_node(t) for t in _DEV_NODES]
    dev_resources = [_build_resource(t, dev_name) for t in _DEV_RESOURCES]
    dev_backups = _build_backup_data(dev_name, dev_resources)
    clusters[dev_name] = {
        "name": dev_name,
        "nodes": dev_nodes,
        "resources": dev_resources,
        "backups": dev_backups,
    }

    return clusters


def get_metrics_history() -> dict:
    """Return the accumulated metrics history for sparkline rendering."""
    return _metrics_history
