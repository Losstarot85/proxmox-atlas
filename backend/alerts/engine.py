import json
import os
import time
from cache import cache
from alerts.store import add_alert, get_silenced
from alerts.anomaly import check_anomalies

RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.json")

# In-memory record of current alerts to prevent repeated spam on every poll
active_alerts = {}
previous_states = {}
ALERT_COOLDOWN = 3600 # Do not regenerate the same alert for one hour, unless changes occur

def load_rules():
    defaults = {
        "cpu_threshold_percent": 85,
        "ram_threshold_percent": 90,
        "disk_usage_threshold_percent": 85,
        "io_stall_threshold_percent": 15,
        "network_threshold_mbps": 800,
        "ram_pressure_threshold_percent": 15
    }
    try:
        with open(RULES_PATH) as f:
            user_rules = json.load(f)
            # Merge defaults for any missing new keys
            defaults.update(user_rules)
            return defaults
    except FileNotFoundError:
        return defaults

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
            n_name = node.get("name", "Unknown")
            silenced = get_silenced()
            base_key = f"{cluster_name}:{n_name}:node"

            # 1. Host Availability (Crash Detector)
            prev_status = previous_states.get(base_key, node.get("status"))
            previous_states[base_key] = node.get("status")

            if node.get("status") != "online":
                if prev_status == "online":
                    ak = f"{base_key}:offline"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert({
                            "cluster": cluster_name, "node": n_name, "resource": "NODE",
                            "severity": "critical",
                            "message": f"CRITICAL: Node {n_name} is OFFLINE or unreachable!"
                        })
                        active_alerts[ak] = current_time
                continue
                
            
            # CPU Node
            cpu_p = (node.get("cpu", 0)) * 100

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

            # RAM Pressure Stall (Thrashing)
            if node.get("pressure_ram", 0) > rules["ram_pressure_threshold_percent"]:
                ak = f"{base_key}:ramstall"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert({
                        "cluster": cluster_name, "node": n_name, "resource": "NODE",
                        "severity": "warning",
                        "message": f"RAM Thrashing (Memory Stalls) on {n_name}: {node['pressure_ram']:.1f}%"
                    })
                    active_alerts[ak] = current_time

            # Load Average vs Capacity
            if node.get("loadavg") is not None and node.get("maxcpu", 0) > 0:
                if node["loadavg"] > node["maxcpu"] + 2:
                    ak = f"{base_key}:loadavg"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert({
                            "cluster": cluster_name, "node": n_name, "resource": "NODE",
                            "severity": "warning",
                            "message": f"Saturated Load Average on {n_name}: {node['loadavg']:.2f} (Max CPU Core: {node['maxcpu']})"
                        })
                        active_alerts[ak] = current_time

            # Network Saturation
            mbps = ((node.get("netin", 0) + node.get("netout", 0)) * 8) / 1000000
            if mbps > rules["network_threshold_mbps"]:
                ak = f"{base_key}:network"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert({
                        "cluster": cluster_name, "node": n_name, "resource": "NODE",
                        "severity": "warning",
                        "message": f"High Network Bandwidth on Node {n_name}: {mbps:.1f} Mbps"
                    })
                    active_alerts[ak] = current_time

        # Check VM/LXC
        for res in data.get("resources", []):
            vmid = res["vmid"]
            r_name = res["name"]
            base_key = f"{cluster_name}:{vmid}:vm"
            
            # Crash / Shutdown Tracker
            prev_status = previous_states.get(base_key, res.get("status"))
            previous_states[base_key] = res.get("status")
            
            if res.get("status") != "running":
                if prev_status == "running":
                    ak = f"{base_key}:offline"
                    silenced = get_silenced()
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert({
                            "cluster": cluster_name, "node": res.get("node", "unknown"), "resource": f"VM {vmid} ({r_name})",
                            "severity": "warning",
                            "message": f"WARNING: Unexpected {res.get('type','VM')} Stop ({r_name})!"
                        })
                        active_alerts[ak] = current_time
                continue
            
            
            # CPU VM
            cpu_p = (res.get("cpu", 0)) * 100
            silenced = get_silenced()
            
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
