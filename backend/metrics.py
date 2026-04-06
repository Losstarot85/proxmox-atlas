from prometheus_client import Gauge

# Metriche per i Nodi
NODE_CPU = Gauge("proxmox_node_cpu_usage_ratio", "Utilizzo CPU dei nodi (0.0-1.0)", ["cluster", "node"])
NODE_MEM_TOTAL = Gauge("proxmox_node_mem_total_bytes", "Memoria totale nodi", ["cluster", "node"])
NODE_MEM_USED = Gauge("proxmox_node_mem_used_bytes", "Memoria utilizzata nodi", ["cluster", "node"])
NODE_UPTIME = Gauge("proxmox_node_uptime_seconds", "Uptime dei nodi in sec", ["cluster", "node"])
NODE_STORAGE_TOTAL = Gauge("proxmox_node_storage_total_bytes", "Capacità totale storage nodo", ["cluster", "node", "storage"])
NODE_STORAGE_USED = Gauge("proxmox_node_storage_used_bytes", "Spazio utilizzato storage nodo", ["cluster", "node", "storage"])
NODE_STORAGE_AVAIL = Gauge("proxmox_node_storage_avail_bytes", "Spazio disponibile storage nodo", ["cluster", "node", "storage"])
# Metriche per le VM/LXC
VM_CPU = Gauge("proxmox_vm_cpu_usage_ratio", "Utilizzo CPU delle macchine (0.0-1.0)", ["cluster", "node", "vmid", "type", "name"])
VM_MEM_TOTAL = Gauge("proxmox_vm_mem_total_bytes", "Memoria totale macchine", ["cluster", "node", "vmid", "type", "name"])
VM_MEM_USED = Gauge("proxmox_vm_mem_used_bytes", "Memoria utilizzata macchine", ["cluster", "node", "vmid", "type", "name"])
VM_DISK_READ = Gauge("proxmox_vm_disk_read_bytes", "Disk read bytes", ["cluster", "node", "vmid", "type", "name"])
VM_DISK_WRITE = Gauge("proxmox_vm_disk_write_bytes", "Disk write bytes", ["cluster", "node", "vmid", "type", "name"])
VM_NET_IN = Gauge("proxmox_vm_net_in_bytes", "Network rx bytes", ["cluster", "node", "vmid", "type", "name"])
VM_NET_OUT = Gauge("proxmox_vm_net_out_bytes", "Network tx bytes", ["cluster", "node", "vmid", "type", "name"])
VM_UPTIME = Gauge("proxmox_vm_uptime_seconds", "Uptime delle macchine", ["cluster", "node", "vmid", "type", "name"])
