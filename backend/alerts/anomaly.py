import httpx
import os
from logger import get_logger

log = get_logger("alerts.anomaly")

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")

async def check_anomalies():
    anomalous_alerts = []
    queries = {
        "NODE_CPU_ANOMALY": 'proxmox_node_cpu_usage_ratio > (avg_over_time(proxmox_node_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_node_cpu_usage_ratio[6h])) and proxmox_node_cpu_usage_ratio > 0.1',
        "VM_CPU_ANOMALY": 'proxmox_vm_cpu_usage_ratio > (avg_over_time(proxmox_vm_cpu_usage_ratio[6h]) + 3 * stddev_over_time(proxmox_vm_cpu_usage_ratio[6h])) and proxmox_vm_cpu_usage_ratio > 0.2',
        "VM_STORAGE_IO_ANOMALY": 'rate(proxmox_vm_disk_write_bytes[5m]) > (avg_over_time(rate(proxmox_vm_disk_write_bytes[5m])[6h:1m]) + 3 * stddev_over_time(rate(proxmox_vm_disk_write_bytes[5m])[6h:1m])) and rate(proxmox_vm_disk_write_bytes[5m]) > 10485760',
        "VM_MEMORY_LEAK_ANOMALY": 'predict_linear(proxmox_vm_mem_used_bytes[1h], 3600) / proxmox_vm_mem_total_bytes > 0.95 and proxmox_vm_mem_used_bytes / proxmox_vm_mem_total_bytes > 0.70'
    }

    try:
        async with httpx.AsyncClient() as client:
            for alert_type, query in queries.items():
                try:
                    res = await client.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=10.0)
                except Exception:
                    continue
                if res.status_code != 200:
                    continue

                data = res.json().get("data", {}).get("result", [])
                for item in data:
                    metric = item.get("metric", {})
                    val = float(item.get("value", [0, 0])[1])
                    cluster = metric.get("cluster", "unknown")
                    node = metric.get("node", "unknown")

                    if alert_type == "NODE_CPU_ANOMALY":
                        anomalous_alerts.append({
                            "cluster": cluster, "node": node, "resource": "NODE",
                            "severity": "warning",
                            "message": f"ANOMALY DETECTED: CPU usage on {node} spiked abnormally to {(val*100):.1f}% (exceeds historic 3σ baseline)",
                            "key_suffix": f"{node}:node:anomaly"
                        })
                    else:
                        # VM-level anomalies — extract vmid and name from Prometheus labels
                        vmid = metric.get("vmid", "unknown")
                        name = metric.get("name", "unknown")

                        if alert_type == "VM_CPU_ANOMALY":
                            msg = f"ANOMALY DETECTED: CPU usage on {name} spiked abnormally to {(val*100):.1f}% (exceeds historic 3σ baseline)"
                            suffix = f"{vmid}:vm:cpu_anomaly"
                        elif alert_type == "VM_STORAGE_IO_ANOMALY":
                            msg = f"ANOMALY DETECTED: Storage Write IO on {name} spiked to {(val/1048576):.1f}MB/s (exceeds historic 3σ baseline)"
                            suffix = f"{vmid}:vm:io_anomaly"
                        elif alert_type == "VM_MEMORY_LEAK_ANOMALY":
                            msg = f"PREDICTIVE WARNING: Memory leak projected for {name}. Usage will exceed 95% within the next hour!"
                            suffix = f"{vmid}:vm:memleak_anomaly"
                        else:
                            continue

                        anomalous_alerts.append({
                            "cluster": cluster, "node": node, "resource": f"VM {vmid} ({name})",
                            "severity": "warning",
                            "message": msg,
                            "key_suffix": suffix
                        })

    except Exception as e:
        log.error("anomaly_detection_error", error=str(e))

    return anomalous_alerts
