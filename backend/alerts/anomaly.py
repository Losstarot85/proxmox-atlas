import httpx
import logging

PROMETHEUS_URL = "http://proxmox-prometheus:9090"

async def check_anomalies():
    anomalous_alerts = []
    # CPU Nodes (se scostamento > 3 sigma)
    # Ignora quando lo stddev è praticamente 0 o cpu è bassissima (< 10%)
    queries = {
        "NODE_CPU_ANOMALY": 'proxmox_node_cpu_usage_ratio > (avg_over_time(proxmox_node_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_node_cpu_usage_ratio[6h])) and proxmox_node_cpu_usage_ratio > 0.1',
        "VM_CPU_ANOMALY": 'proxmox_vm_cpu_usage_ratio > (avg_over_time(proxmox_vm_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_vm_cpu_usage_ratio[6h])) and proxmox_vm_cpu_usage_ratio > 0.2'
    }

    try:
        async with httpx.AsyncClient() as client:
            for alert_type, query in queries.items():
                res = await client.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=10.0)
                if res.status_code == 200:
                    data = res.json().get("data", {}).get("result", [])
                    for item in data:
                        metric = item.get("metric", {})
                        val = float(item.get("value", [0, 0])[1])
                        
                        if "NODE" in alert_type:
                            cluster = metric.get("cluster", "unknown")
                            node = metric.get("node", "unknown")
                            anomalous_alerts.append({
                                "cluster": cluster, "node": node, "resource": "NODE",
                                "severity": "warning",
                                "message": f"ANOMALY DETECTED: CPU usage on {node} spiked abnormally to {(val*100):.1f}% (exceeds historic 3σ baseline)",
                                "key_suffix": f"{node}:node:anomaly"
                            })
                        elif "VM" in alert_type:
                            cluster = metric.get("cluster", "unknown")
                            node = metric.get("node", "unknown")
                            vmid = metric.get("vmid", "unknown")
                            name = metric.get("name", "unknown")
                            anomalous_alerts.append({
                                "cluster": cluster, "node": node, "resource": f"VM {vmid} ({name})",
                                "severity": "warning",
                                "message": f"ANOMALY DETECTED: CPU usage on {name} spiked abnormally to {(val*100):.1f}% (exceeds historic 3σ baseline)",
                                "key_suffix": f"{vmid}:vm:anomaly"
                            })

    except Exception as e:
        logging.getLogger().error(f"Error checking anomalies: {e}")

    return anomalous_alerts
