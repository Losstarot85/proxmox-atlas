import json
import os
import time
from cache import cache
from alerts.store import add_alert, get_silenced
from alerts.anomaly import check_anomalies

RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.json")

# In-memory record of current alerts to prevent repeated spam on every poll
active_alerts = {}
ALERT_COOLDOWN = 3600 # Do not regenerate the same alert for one hour, unless changes occur

def load_rules():
    try:
        with open(RULES_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "cpu_threshold_percent": 85,
            "ram_threshold_percent": 90,
            "disk_usage_threshold_percent": 85,
            "io_stall_threshold_percent": 15
        }

async def evaluate_alerts():
    rules = load_rules()
    current_time = time.time()
    
    # Clean up expired active alerts
    keys_to_remove = []
    for k, v in active_alerts.items():
        if current_time - v > ALERT_COOLDOWN:
            keys_to_remove.append(k)
    for k in keys_to_remove:
        del active_alerts[k]

    for cluster_name, data in cache.items():
        # Check nodes
        for node in data.get("nodes", []):
            if node.get("status") != "online":
                continue
                
            n_name = node["name"]
            
            # CPU Node
            cpu_p = (node.get("cpu", 0)) * 100
            
            silenced = get_silenced()
            base_key = f"{cluster_name}:{n_name}:node"

            if cpu_p > rules["cpu_threshold_percent"]:
                ak = f"{base_key}:cpu"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert({
                        "cluster": cluster_name, "node": n_name, "resource": "NODE",
                        "severity": "critical" if cpu_p > 95 else "warning",
                        "message": f"High CPU usage on node {n_name}: {cpu_p:.1f}%"
                    })
                    active_alerts[ak] = current_time

            # RAM Node
            if node.get("maxmem", 0) > 0:
                ram_p = (node.get("mem", 0) / node["maxmem"]) * 100
                if ram_p > rules["ram_threshold_percent"]:
                    ak = f"{base_key}:ram"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert({
                            "cluster": cluster_name, "node": n_name, "resource": "NODE",
                            "severity": "critical" if ram_p > 95 else "warning",
                            "message": f"High RAM usage on node {n_name}: {ram_p:.1f}%"
                        })
                        active_alerts[ak] = current_time

            # Storage
            for sp in node.get("storage_pools", []):
                if sp.get("active", 0) == 1 and sp.get("total", 0) > 0:
                    disk_p = (sp["used"] / sp["total"]) * 100
                    if disk_p > rules["disk_usage_threshold_percent"]:
                        pool_name = sp["storage"]
                        ak = f"{base_key}:storage:{pool_name}"
                        if ak not in active_alerts and base_key not in silenced:
                            add_alert({
                                "cluster": cluster_name, "node": n_name, "resource": "STORAGE",
                                "severity": "critical" if disk_p > 95 else "warning",
                                "message": f"Storage pool '{pool_name}' almost full on {n_name}: {disk_p:.1f}%"
                            })
                            active_alerts[ak] = current_time
            
            # IO Stall
            if node.get("pressure_io", 0) > rules["io_stall_threshold_percent"]:
                ak = f"{base_key}:iostall"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert({
                        "cluster": cluster_name, "node": n_name, "resource": "NODE",
                        "severity": "warning",
                        "message": f"High IO pressure stall on {n_name}: {node['pressure_io']:.1f}%"
                    })
                    active_alerts[ak] = current_time

        # Check VM/LXC
        for res in data.get("resources", []):
            if res.get("status") != "running":
                continue
            
            vmid = res["vmid"]
            r_name = res["name"]
            
            # CPU VM
            cpu_p = (res.get("cpu", 0)) * 100
            base_key = f"{cluster_name}:{vmid}:vm"
            
            if cpu_p > rules["cpu_threshold_percent"]:
                ak = f"{base_key}:cpu"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert({
                        "cluster": cluster_name, "node": res["node"], "resource": f"VM {vmid} ({r_name})",
                        "severity": "warning",
                        "message": f"High CPU usage on {res['type']} {r_name}: {cpu_p:.1f}%"
                    })
                    active_alerts[ak] = current_time
                    
            # RAM VM
            if res.get("maxmem", 0) > 0:
                ram_p = (res.get("mem", 0) / res["maxmem"]) * 100
                if ram_p > rules["ram_threshold_percent"]:
                    ak = f"{base_key}:ram"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert({
                            "cluster": cluster_name, "node": res["node"], "resource": f"VM {vmid} ({r_name})",
                            "severity": "warning",
                            "message": f"High RAM usage on {res['type']} {r_name}: {ram_p:.1f}%"
                        })
                        active_alerts[ak] = current_time

    # ANOMALY DETECTION
    anomalies = await check_anomalies()
    silenced = get_silenced()
    for an in anomalies:
        ak = f"{an['cluster']}:{an['key_suffix']}"
        # Skip if silenced
        if ak in silenced and current_time < silenced[ak]:
            continue
            
        if ak not in active_alerts:
            # Remove key_suffix before inserting
            an.pop("key_suffix", None)
            add_alert(an)
            active_alerts[ak] = current_time
