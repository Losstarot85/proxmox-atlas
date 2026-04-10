import time
import uuid
from config import SETTINGS

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
    alerts_store = [a for a in alerts_store if a["id"] != alert_id]

def clear_alerts():
    global alerts_store
    alerts_store = []

def silence_resource(alert_id: str, minutes: int = 60):
    for a in alerts_store:
        if a["id"] == alert_id:
            # Build a unique resource key based on content
            # For nodes: cluster:node:node
            # For VMs: cluster:vmid:vm
            # We build a generic key string for simplicity
            if "VM" in a["resource"] or "LXC" in a["resource"]:
                # Extract vmid from resource name "VM/LXC vmid (name)"
                try:
                    vmid = a["resource"].split(" ")[1]
                except IndexError:
                    vmid = "unknown"
                key = f"{a['cluster']}:{vmid}:vm"
            else:
                key = f"{a['cluster']}:{a['node']}:node"
                
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
