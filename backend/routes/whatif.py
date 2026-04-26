from fastapi import APIRouter, HTTPException, Query

from cache import cache

router = APIRouter()


@router.get("/what-if")
def what_if_simulation(
    cluster: str = Query(..., description="Cluster name"),
    remove_node: str = Query(..., description="Physical node to simulate as removed")
):
    """
    Simulates the removal of a physical node from the cluster and calculates:
    - Which VM/LXC would become orphaned (cannot be hosted elsewhere)
    - Where surviving VMs could migrate to
    - Which nodes would become congested after migration
    No actual changes to the cluster. Pure in-memory calculation on cached data.

    Algorithm: Greedy bin-packing (largest-first by maxmem).
    Displaced VMs are sorted by allocated RAM descending and placed on the
    surviving node with the most free memory that still has sufficient vCPU capacity.

    Known limitations (also surfaced in the response):
    - Does not model CPU overcommit ratios (treats vCPU as discrete units)
    - Does not consider shared storage topology (Ceph, NFS, iSCSI reachability)
    - Congestion thresholds are hardcoded (CPU >80%, RAM >85%)
    """

    if cluster not in cache:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    cluster_data = cache[cluster]
    nodes = cluster_data.get("nodes", [])
    resources = cluster_data.get("resources", [])

    # Verify that the node to remove exists
    removed_node = next((n for n in nodes if n["name"] == remove_node), None)
    if not removed_node:
        raise HTTPException(status_code=404, detail=f"Node '{remove_node}' not found in cluster '{cluster}'")

    # Surviving nodes (online and != removed node)
    surviving_nodes = [n for n in nodes if n["name"] != remove_node and n["status"] == "online"]

    if not surviving_nodes:
        # All nodes are offline or removed: all VMs are orphaned
        orphaned_vms = [r for r in resources if r["node"] == remove_node and r["status"] == "running"]
        return {
            "removed_node": remove_node,
            "cluster": cluster,
            "removed_node_info": _node_summary(removed_node),
            "surviving_nodes": [],
            "orphaned_vms": [_vm_summary(vm) for vm in orphaned_vms],
            "migration_plan": [],
            "congested_nodes": [],
            "summary": {
                "total_displaced_vms": len(orphaned_vms),
                "migratable": 0,
                "orphaned": len(orphaned_vms),
                "congested_count": 0
            }
        }

    # VM/LXC currently running on the removed node
    displaced_vms = [r for r in resources if r["node"] == remove_node and r["status"] == "running"]

    # Calculate remaining capacity for each surviving node
    # For each node: free_cpu = maxcpu - (cpu_ratio * maxcpu), free_mem = maxmem - mem_used
    # Where mem_used is calculated from VMs currently allocated on that node
    node_capacity = {}
    for sn in surviving_nodes:
        # VMs already allocated on this node
        current_vms = [r for r in resources if r["node"] == sn["name"] and r["status"] == "running"]
        used_vcpus = sum(r["maxcpu"] for r in current_vms)
        used_mem = sum(r["mem"] for r in current_vms)

        node_capacity[sn["name"]] = {
            "total_cpu": sn["maxcpu"],
            "total_mem": sn["maxmem"],
            "used_vcpus": used_vcpus,
            "used_mem": used_mem,
            "free_vcpus": sn["maxcpu"] - used_vcpus,
            "free_mem": sn["maxmem"] - used_mem,
            "current_cpu_ratio": sn["cpu"],
            "vm_count": len(current_vms)
        }

    # Greedy migration: assign each displaced VM to the node with the most free resources
    migration_plan = []
    orphaned_vms = []

    # Sort VMs by resource requirements descending (largest first = best-fit)
    displaced_sorted = sorted(displaced_vms, key=lambda v: v["maxmem"], reverse=True)

    for vm in displaced_sorted:
        vm_needed_vcpus = vm["maxcpu"]
        vm_needed_mem = vm["maxmem"]  # Use allocated RAM, not current usage, for safe capacity planning

        # Find the best candidate node: sufficient free memory and vCPU
        best_node = None
        best_free_mem = -1

        for sn_name, cap in node_capacity.items():
            if cap["free_mem"] >= vm_needed_mem and cap["free_vcpus"] >= vm_needed_vcpus:
                if cap["free_mem"] > best_free_mem:
                    best_free_mem = cap["free_mem"]
                    best_node = sn_name

        if best_node:
            migration_plan.append({
                "vm": _vm_summary(vm),
                "target_node": best_node,
                "fit_score": round(best_free_mem / node_capacity[best_node]["total_mem"] * 100, 1)
            })
            # Update capacity
            node_capacity[best_node]["free_mem"] -= vm_needed_mem
            node_capacity[best_node]["used_mem"] += vm_needed_mem
            node_capacity[best_node]["free_vcpus"] -= vm_needed_vcpus
            node_capacity[best_node]["used_vcpus"] += vm_needed_vcpus
            node_capacity[best_node]["vm_count"] += 1
        else:
            orphaned_vms.append(_vm_summary(vm))

    # Identify congested nodes after migration (CPU > 80% or MEM > 85%)
    CONGESTION_CPU_THRESHOLD = 0.80
    CONGESTION_MEM_THRESHOLD = 0.85

    congested_nodes = []
    surviving_summary = []

    for sn in surviving_nodes:
        cap = node_capacity[sn["name"]]
        mem_ratio = cap["used_mem"] / cap["total_mem"] if cap["total_mem"] > 0 else 0
        cpu_overcommit = cap["used_vcpus"] / cap["total_cpu"] if cap["total_cpu"] > 0 else 0

        node_report = {
            "name": sn["name"],
            "total_cpu": cap["total_cpu"],
            "total_mem": cap["total_mem"],
            "used_mem_after": cap["used_mem"],
            "used_vcpus_after": cap["used_vcpus"],
            "mem_ratio_after": round(mem_ratio * 100, 1),
            "vcpu_ratio_after": round(cpu_overcommit * 100, 1),
            "vm_count_after": cap["vm_count"],
            "congested": mem_ratio > CONGESTION_MEM_THRESHOLD or cpu_overcommit > CONGESTION_CPU_THRESHOLD
        }

        surviving_summary.append(node_report)

        if node_report["congested"]:
            congested_nodes.append(node_report)

    return {
        "removed_node": remove_node,
        "cluster": cluster,
        "removed_node_info": _node_summary(removed_node),
        "surviving_nodes": surviving_summary,
        "orphaned_vms": orphaned_vms,
        "migration_plan": migration_plan,
        "congested_nodes": congested_nodes,
        "summary": {
            "total_displaced_vms": len(displaced_vms),
            "migratable": len(migration_plan),
            "orphaned": len(orphaned_vms),
            "congested_count": len(congested_nodes)
        },
        "limitations": [
            "Does not model CPU overcommit — treats vCPU as discrete units; Proxmox may tolerate higher overcommit in practice",
            "Does not consider shared storage topology — migration requires storage to be accessible from the target node (Ceph, NFS, iSCSI)",
            "Uses allocated RAM (maxmem) for capacity checks — actual usage may be lower, enabling denser packing with ballooning",
            "Congestion thresholds are hardcoded at CPU >80% and RAM >85% — not configurable via API"
        ]
    }


def _node_summary(node: dict) -> dict:
    return {
        "name": node["name"],
        "status": node["status"],
        "cpu": node["cpu"],
        "maxcpu": node["maxcpu"],
        "mem": node["mem"],
        "maxmem": node["maxmem"]
    }


def _vm_summary(vm: dict) -> dict:
    return {
        "vmid": vm["vmid"],
        "name": vm["name"],
        "type": vm["type"],
        "cpu": vm["cpu"],
        "maxcpu": vm["maxcpu"],
        "mem": vm["mem"],
        "maxmem": vm["maxmem"]
    }
