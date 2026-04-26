from prometheus_client import Gauge

# Node metrics
NODE_CPU = Gauge("proxmox_node_cpu_usage_ratio", "Node CPU usage ratio (0.0-1.0)", ["cluster", "node"])
NODE_MEM_TOTAL = Gauge("proxmox_node_mem_total_bytes", "Total node memory", ["cluster", "node"])
NODE_MEM_USED = Gauge("proxmox_node_mem_used_bytes", "Used node memory", ["cluster", "node"])
NODE_UPTIME = Gauge("proxmox_node_uptime_seconds", "Node uptime in seconds", ["cluster", "node"])
NODE_STORAGE_TOTAL = Gauge(
    "proxmox_node_storage_total_bytes", "Total node storage capacity", ["cluster", "node", "storage"]
)
NODE_STORAGE_USED = Gauge("proxmox_node_storage_used_bytes", "Used node storage space", ["cluster", "node", "storage"])
NODE_STORAGE_AVAIL = Gauge(
    "proxmox_node_storage_avail_bytes", "Available node storage space", ["cluster", "node", "storage"]
)
# VM/LXC metrics
VM_CPU = Gauge(
    "proxmox_vm_cpu_usage_ratio", "VM/LXC CPU usage ratio (0.0-1.0)", ["cluster", "node", "vmid", "type", "name"]
)
VM_MEM_TOTAL = Gauge("proxmox_vm_mem_total_bytes", "Total VM/LXC memory", ["cluster", "node", "vmid", "type", "name"])
VM_MEM_USED = Gauge("proxmox_vm_mem_used_bytes", "Used VM/LXC memory", ["cluster", "node", "vmid", "type", "name"])
VM_DISK_READ = Gauge("proxmox_vm_disk_read_bytes", "Disk read bytes", ["cluster", "node", "vmid", "type", "name"])
VM_DISK_WRITE = Gauge("proxmox_vm_disk_write_bytes", "Disk write bytes", ["cluster", "node", "vmid", "type", "name"])
VM_NET_IN = Gauge("proxmox_vm_net_in_bytes", "Network rx bytes", ["cluster", "node", "vmid", "type", "name"])
VM_NET_OUT = Gauge("proxmox_vm_net_out_bytes", "Network tx bytes", ["cluster", "node", "vmid", "type", "name"])
VM_UPTIME = Gauge("proxmox_vm_uptime_seconds", "VM/LXC uptime in seconds", ["cluster", "node", "vmid", "type", "name"])
