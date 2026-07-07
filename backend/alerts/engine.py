import json
import os
import time

from alerts.anomaly import check_anomalies
from alerts.store import add_alert, get_silenced
from cache import cache
from logger import get_logger

log = get_logger("alerts.engine")

DEFAULT_RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.json")
DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(os.path.dirname(__file__)))
RULES_PATH = os.path.join(DATA_DIR, "rules.json")
ALERT_STATE_PATH = os.path.join(DATA_DIR, "alert_state.json")

# In-memory record of current alerts to prevent repeated spam on every poll
active_alerts = {}
previous_states = {}
ALERT_COOLDOWN = 3600  # Do not regenerate the same alert for one hour, unless changes occur

# Track whether state changed to avoid unnecessary disk writes
_state_dirty = False


def _load_alert_state():
    """Load persisted alert state from disk on startup."""
    global active_alerts, previous_states
    try:
        if os.path.exists(ALERT_STATE_PATH):
            with open(ALERT_STATE_PATH) as f:
                data = json.load(f)
            active_alerts = data.get("active_alerts", {})
            previous_states = data.get("previous_states", {})
            # Convert string keys back to float values (JSON serializes them fine, but be safe)
            active_alerts_parsed = {}
            for k, v in active_alerts.items():
                try:
                    active_alerts_parsed[k] = float(v) if v is not None else 0.0
                except (ValueError, TypeError):
                    active_alerts_parsed[k] = 0.0
            active_alerts = active_alerts_parsed
            log.info("alert_state_loaded", keys=len(active_alerts))
    except (json.JSONDecodeError, Exception) as e:
        log.warning("alert_state_load_failed", error=str(e))
        active_alerts = {}
        previous_states = {}


def save_alert_state():
    """Persist alert state to disk. Only writes if state has changed."""
    global _state_dirty
    if not _state_dirty:
        return
    try:
        with open(ALERT_STATE_PATH, "w") as f:
            json.dump({"active_alerts": active_alerts, "previous_states": previous_states, "saved_at": time.time()}, f)
        _state_dirty = False
    except Exception as e:
        log.error("alert_state_save_failed", error=str(e))


def mark_state_dirty():
    """Mark state as needing persistence (called from store.py on dismiss/clear)."""
    global _state_dirty
    _state_dirty = True


# Load persisted state on import
_load_alert_state()


def get_effective_rule(rules, rule_key, cluster_name, identifier, rule_type):
    """
    Returns the effective threshold value for a rule.
    If the rule type is disabled globally, returns float('inf') to disable triggers.
    Otherwise, check if a resource-specific override exists under rules['overrides'][f"{cluster_name}:{identifier}"].
    If not, falls back to the global default rule value.
    """
    enabled_rules = rules.get("enabled_rules", {})
    if not enabled_rules.get(rule_type, True):
        return float('inf')
        
    overrides = rules.get("overrides", {})
    res_key = f"{cluster_name}:{identifier}"
    if res_key in overrides:
        res_override = overrides[res_key]
        if rule_key in res_override:
            return res_override[rule_key]
            
    return rules.get(rule_key, float('inf'))


def load_rules():
    defaults = {
        "cpu_threshold_percent": 85,
        "ram_threshold_percent": 90,
        "disk_usage_threshold_percent": 85,
        "io_stall_threshold_percent": 15,
        "network_threshold_mbps": 800,
        "ram_pressure_threshold_percent": 15,
        "backup_max_days": 7,
        "enabled_rules": {
            "cpu": True,
            "ram": True,
            "disk": True,
            "iowait": True,
            "network": True,
            "ram_pressure": True,
            "backup": True
        },
        "overrides": {}
    }
    path_to_load = RULES_PATH
    if not os.path.exists(path_to_load) and os.path.exists(DEFAULT_RULES_PATH):
        path_to_load = DEFAULT_RULES_PATH

    try:
        with open(path_to_load) as f:
            user_rules = json.load(f)
            if "enabled_rules" in user_rules:
                defaults["enabled_rules"].update(user_rules["enabled_rules"])
                user_rules.pop("enabled_rules")
            if "overrides" in user_rules:
                defaults["overrides"].update(user_rules["overrides"])
                user_rules.pop("overrides")
            defaults.update(user_rules)
            return defaults
    except Exception:
        return defaults


def save_rules(rules_data):
    try:
        with open(RULES_PATH, "w") as f:
            json.dump(rules_data, f, indent=2)
        return True
    except Exception as e:
        log.error("save_rules_failed", error=str(e))
        return False


async def evaluate_alerts():
    rules = load_rules()
    current_time = time.time()

    global _state_dirty
    _initial_size = len(active_alerts)

    # Clean up expired active alerts
    keys_to_remove = []
    for k, v in active_alerts.items():
        if current_time - v > ALERT_COOLDOWN:
            keys_to_remove.append(k)
    for k in keys_to_remove:
        del active_alerts[k]

    for cluster_name, data in cache.items():
        vmid_to_latest_backup = {}
        for b in data.get("backups", []):
            b_vmid = b.get("vmid")
            b_ctime = b.get("ctime", 0)
            if b_vmid is not None:
                if b_vmid not in vmid_to_latest_backup or b_ctime > vmid_to_latest_backup[b_vmid]:
                    vmid_to_latest_backup[b_vmid] = b_ctime

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
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": n_name,
                                "resource": "NODE",
                                "severity": "critical",
                                "message": f"CRITICAL: Node {n_name} is OFFLINE or unreachable!",
                            }
                        )
                        active_alerts[ak] = current_time
                continue

            # CPU Node
            cpu_p = (node.get("cpu", 0)) * 100

            if cpu_p > get_effective_rule(rules, "cpu_threshold_percent", cluster_name, n_name, "cpu"):
                ak = f"{base_key}:cpu"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert(
                        {
                            "cluster": cluster_name,
                            "node": n_name,
                            "resource": "NODE",
                            "severity": "critical" if cpu_p > 95 else "warning",
                            "message": f"High CPU usage on node {n_name}: {cpu_p:.1f}%",
                        }
                    )
                    active_alerts[ak] = current_time

            # RAM Node
            if node.get("maxmem", 0) > 0:
                ram_p = (node.get("mem", 0) / node["maxmem"]) * 100
                if ram_p > get_effective_rule(rules, "ram_threshold_percent", cluster_name, n_name, "ram"):
                    ak = f"{base_key}:ram"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": n_name,
                                "resource": "NODE",
                                "severity": "critical" if ram_p > 95 else "warning",
                                "message": f"High RAM usage on node {n_name}: {ram_p:.1f}%",
                            }
                        )
                        active_alerts[ak] = current_time

            # Storage
            for sp in node.get("storage_pools", []):
                if sp.get("active", 0) == 1 and sp.get("total", 0) > 0:
                    disk_p = (sp["used"] / sp["total"]) * 100
                    if disk_p > get_effective_rule(rules, "disk_usage_threshold_percent", cluster_name, n_name, "disk"):
                        pool_name = sp["storage"]
                        ak = f"{base_key}:storage:{pool_name}"
                        if ak not in active_alerts and base_key not in silenced:
                            add_alert(
                                {
                                    "cluster": cluster_name,
                                    "node": n_name,
                                    "resource": "STORAGE",
                                    "severity": "critical" if disk_p > 95 else "warning",
                                    "message": f"Storage pool '{pool_name}' almost full on {n_name}: {disk_p:.1f}%",
                                }
                            )
                            active_alerts[ak] = current_time

            # IO Stall
            if node.get("pressure_io", 0) > get_effective_rule(rules, "io_stall_threshold_percent", cluster_name, n_name, "iowait"):
                ak = f"{base_key}:iostall"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert(
                        {
                            "cluster": cluster_name,
                            "node": n_name,
                            "resource": "NODE",
                            "severity": "warning",
                            "message": f"High IO pressure stall on {n_name}: {node['pressure_io']:.1f}%",
                        }
                    )
                    active_alerts[ak] = current_time

            # RAM Pressure Stall (Thrashing)
            if node.get("pressure_ram", 0) > get_effective_rule(rules, "ram_pressure_threshold_percent", cluster_name, n_name, "ram_pressure"):
                ak = f"{base_key}:ramstall"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert(
                        {
                            "cluster": cluster_name,
                            "node": n_name,
                            "resource": "NODE",
                            "severity": "warning",
                            "message": f"RAM Thrashing (Memory Stalls) on {n_name}: {node['pressure_ram']:.1f}%",
                        }
                    )
                    active_alerts[ak] = current_time

            # Load Average vs Capacity
            if node.get("loadavg") is not None and node.get("maxcpu", 0) > 0:
                if node["loadavg"] > node["maxcpu"] + 2:
                    ak = f"{base_key}:loadavg"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": n_name,
                                "resource": "NODE",
                                "severity": "warning",
                                "message": f"Saturated Load Average on {n_name}: {node['loadavg']:.2f} (Max CPU Core: {node['maxcpu']})",
                            }
                        )
                        active_alerts[ak] = current_time

            # Network Saturation
            mbps = ((node.get("netin", 0) + node.get("netout", 0)) * 8) / 1000000
            if mbps > get_effective_rule(rules, "network_threshold_mbps", cluster_name, n_name, "network"):
                ak = f"{base_key}:network"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert(
                        {
                            "cluster": cluster_name,
                            "node": n_name,
                            "resource": "NODE",
                            "severity": "warning",
                            "message": f"High Network Bandwidth on Node {n_name}: {mbps:.1f} Mbps",
                        }
                    )
                    active_alerts[ak] = current_time

        # Check VM/LXC
        for res in data.get("resources", []):
            vmid = res["vmid"]
            r_name = res["name"]
            base_key = f"{cluster_name}:{vmid}:vm"

            # 5.4 Backup Status Monitoring Alert Rule
            latest_ctime = vmid_to_latest_backup.get(vmid)
            backup_max_days = get_effective_rule(rules, "backup_max_days", cluster_name, vmid, "backup")
            silenced = get_silenced()

            if backup_max_days != float("inf"):
                if latest_ctime is None:
                    ak = f"{base_key}:backup_never"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": res.get("node", "unknown"),
                                "resource": f"{res.get('type', 'VM')} {vmid} ({r_name})",
                                "severity": "warning",
                                "message": f"VM {r_name} has no backup in {backup_max_days} days (never backed up)",
                            }
                        )
                        active_alerts[ak] = current_time
                else:
                    days_since = (current_time - latest_ctime) / 86400.0
                    if days_since > backup_max_days:
                        ak = f"{base_key}:backup_old"
                        if ak not in active_alerts and base_key not in silenced:
                            from datetime import datetime

                            last_backup_str = datetime.fromtimestamp(latest_ctime).strftime("%Y-%m-%d")
                            add_alert(
                                {
                                    "cluster": cluster_name,
                                    "node": res.get("node", "unknown"),
                                    "resource": f"{res.get('type', 'VM')} {vmid} ({r_name})",
                                    "severity": "warning",
                                    "message": f"VM {r_name} has no backup in {int(days_since)} days (last backup: {last_backup_str})",
                                }
                            )
                            active_alerts[ak] = current_time

            # Crash / Shutdown Tracker
            prev_status = previous_states.get(base_key, res.get("status"))
            previous_states[base_key] = res.get("status")

            if res.get("status") != "running":
                if prev_status == "running":
                    ak = f"{base_key}:offline"
                    silenced = get_silenced()
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": res.get("node", "unknown"),
                                "resource": f"VM {vmid} ({r_name})",
                                "severity": "warning",
                                "message": f"WARNING: Unexpected {res.get('type', 'VM')} Stop ({r_name})!",
                            }
                        )
                        active_alerts[ak] = current_time
                continue

            # CPU VM
            cpu_p = (res.get("cpu", 0)) * 100
            silenced = get_silenced()

            if cpu_p > get_effective_rule(rules, "cpu_threshold_percent", cluster_name, vmid, "cpu"):
                ak = f"{base_key}:cpu"
                if ak not in active_alerts and base_key not in silenced:
                    add_alert(
                        {
                            "cluster": cluster_name,
                            "node": res["node"],
                            "resource": f"VM {vmid} ({r_name})",
                            "severity": "warning",
                            "message": f"High CPU usage on {res['type']} {r_name}: {cpu_p:.1f}%",
                        }
                    )
                    active_alerts[ak] = current_time

            # RAM VM
            if res.get("maxmem", 0) > 0:
                ram_p = (res.get("mem", 0) / res["maxmem"]) * 100
                if ram_p > get_effective_rule(rules, "ram_threshold_percent", cluster_name, vmid, "ram"):
                    ak = f"{base_key}:ram"
                    if ak not in active_alerts and base_key not in silenced:
                        add_alert(
                            {
                                "cluster": cluster_name,
                                "node": res["node"],
                                "resource": f"VM {vmid} ({r_name})",
                                "severity": "warning",
                                "message": f"High RAM usage on {res['type']} {r_name}: {ram_p:.1f}%",
                            }
                        )
                        active_alerts[ak] = current_time

    # ANOMALY DETECTION
    anomalies = await check_anomalies()
    silenced = get_silenced()
    for an in anomalies:
        ak = f"{an['cluster']}:{an['key_suffix']}"

        # Derive the base silence key from the anomaly's key_suffix
        # key_suffix format: "node:node:anomaly" or "vmid:vm:cpu_anomaly"
        suffix_parts = an["key_suffix"].split(":")
        if len(suffix_parts) >= 2:
            # e.g. "123:vm:cpu_anomaly" → base = "cluster:123:vm"
            silence_base = f"{an['cluster']}:{suffix_parts[0]}:{suffix_parts[1]}"
        else:
            silence_base = ak

        # Skip if the resource is silenced
        if silence_base in silenced and current_time < silenced[silence_base]:
            continue

        if ak not in active_alerts:
            # Remove key_suffix before inserting
            an.pop("key_suffix", None)
            add_alert(an)
            active_alerts[ak] = current_time

    # Mark dirty if any alerts were added or removed during this cycle
    if len(active_alerts) != _initial_size:
        _state_dirty = True

    # Persist state to disk (debounced — only writes if something changed)
    save_alert_state()
