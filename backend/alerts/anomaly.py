import httpx
import logging
import os

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")

async def check_anomalies():
    anomalous_alerts = []
    # CPU Nodes (if deviation > 3 sigma)
    # Skip when stddev is practically 0 or CPU is very low (< 10%)
    queries = {
        "NODE_CPU_ANOMALY": 'proxmox_node_cpu_usage_ratio > (avg_over_time(proxmox_node_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_node_cpu_usage_ratio[6h])) and proxmox_node_cpu_usage_ratio > 0.1',
        "VM_CPU_ANOMALY": 'proxmox_vm_cpu_usage_ratio > (avg_over_time(proxmox_vm_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_vm_cpu_usage_ratio[6h])) and proxmox_vm_cpu_usage_ratio > 0.2',
        "VM_STORAGE_IO_ANOMALY": 'rate(proxmox_vm_disk_write_bytes_total[5m]) > (avg_over_time(rate(proxmox_vm_disk_write_bytes_total[5m])[6h:1m]) + 3 * stddev_over_time(rate(proxmox_vm_disk_write_bytes_total[5m])[6h:1m])) and rate(proxmox_vm_disk_write_bytes_total[5m]) > 10485760',
        "VM_MEMORY_LEAK_ANOMALY": 'predict_linear(proxmox_vm_memory_usage_ratio[1h], 3600) > 0.95 and proxmox_vm_memory_usage_ratio > 0.70'
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
                            if alert_type == "VM_CPU_ANOMALY":
                                msg = f"ANOMALY DETECTED: CPU usage on {name} spiked abnormally to {(val*100):.1f}% (exceeds historic 3σ baseline)"
                                suffix = f"{vmid}:vm:cpu_anomaly"
                            elif alert_type == "VM_STORAGE_IO_ANOMALY":
                                msg = f"ANOMALY DETECTED: Storage Write IOPS on {name} spiked to {(val/1048576):.1f}MB/s (exceeds historic 3σ baseline)"
                                suffix = f"{vmid}:vm:io_anomaly"
                            elif alert_type == "VM_MEMORY_LEAK_ANOMALY":
                                msg = f"PREDICTIVE WARNING: Continuous Memory Leak projected for {name}. Usage will exceed 95% within the next hour!"
                                suffix = f"{vmid}:vm:memleak_anomaly"

                            anomalous_alerts.append({
                                "cluster": cluster, "node": node, "resource": f"VM {vmid} ({name})",
                                "severity": "warning",
                                "message": msg,
                                "key_suffix": suffix
                            })

    except Exception as e:
        logging.getLogger().error(f"Error checking anomalies: {e}")

    return anomalous_alerts
