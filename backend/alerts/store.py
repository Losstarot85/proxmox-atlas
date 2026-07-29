import time
import uuid

# In-memory buffer, list of dicts
# Alert format: { "id": str, "timestamp": float, "cluster": str, "node": str, "resource": str, "severity": "warning"|"critical", "message": str, "read": bool }
MAX_ALERTS = 200
alerts_store = []
silenced_resources = {}

from alerts.notifier import queue_alert


def add_alert(alert):
    alert["id"] = str(uuid.uuid4())
    alert["timestamp"] = time.time()
    alert["read"] = False
    alerts_store.insert(0, alert)
    if len(alerts_store) > MAX_ALERTS:
        alerts_store.pop()

    queue_alert(alert)


def get_alerts():
    return alerts_store


def mark_read(alert_id: str):
    for a in alerts_store:
        if a["id"] == alert_id:
            a["read"] = True
            break


def delete_alert(alert_id: str):
    global alerts_store
    # Clear the cooldown in engine so the same condition can re-trigger immediately
    from alerts.engine import active_alerts, mark_state_dirty, save_alert_state

    for a in alerts_store:
        if a["id"] == alert_id:
            _clear_cooldown_for_alert(a, active_alerts)
            break
    alerts_store = [a for a in alerts_store if a["id"] != alert_id]
    mark_state_dirty()
    save_alert_state()


def clear_alerts():
    global alerts_store
    from alerts.engine import active_alerts, mark_state_dirty, save_alert_state

    active_alerts.clear()
    alerts_store = []
    mark_state_dirty()
    save_alert_state()


def _derive_resource_key(alert):
    cluster = alert.get("cluster", "")
    node = alert.get("node", "")
    resource = alert.get("resource", "")

    if resource == "VM GROUP" or resource == "STORAGE" or resource == "NODE":
        return f"{cluster}:{node}:node"

    # For individual VM / LXC: "VM 100 (k8s-control-plane)" or "LXC 200 (db)"
    parts = resource.split(" ")
    if len(parts) >= 2 and parts[1].isdigit():
        vmid = parts[1]
        return f"{cluster}:{vmid}:vm"

    return f"{cluster}:{node}:node"


def _clear_cooldown_for_alert(alert, active_alerts):
    """Remove all cooldown keys that match this alert's cluster/resource."""
    prefix = _derive_resource_key(alert)

    # Remove all cooldown entries that start with this prefix
    keys_to_remove = [k for k in active_alerts if k.startswith(prefix)]
    for k in keys_to_remove:
        del active_alerts[k]


def silence_resource(alert_id: str, minutes: int = 60):
    for a in alerts_store:
        if a["id"] == alert_id:
            key = _derive_resource_key(a)
            silenced_resources[key] = time.time() + (minutes * 60)
            a["read"] = True
            break


def get_silenced():
    # Clean up expired entries
    curr = time.time()
    for k in list(silenced_resources.keys()):
        if curr > silenced_resources[k]:
            del silenced_resources[k]
    return silenced_resources
