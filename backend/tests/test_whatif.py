"""Tests for What-If simulation engine."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _seed_cache_with_cluster(cluster_name, nodes, resources):
    """Helper to seed the cache with test data."""
    from cache import cache
    cache[cluster_name] = {
        "nodes": nodes,
        "resources": resources,
        "network": [],
        "last_update": "2026-01-01 00:00:00",
        "node_error": None,
        "resource_error": None,
        "failed_nodes": []
    }


def test_whatif_basic_migration(client, auth_headers):
    """Removing a node should migrate its VMs to surviving nodes."""
    _seed_cache_with_cluster("test-cl", [
        {"name": "node1", "status": "online", "cpu": 0.3, "maxcpu": 8, "mem": 4e9, "maxmem": 16e9},
        {"name": "node2", "status": "online", "cpu": 0.2, "maxcpu": 8, "mem": 2e9, "maxmem": 16e9},
    ], [
        {"vmid": 100, "name": "vm1", "node": "node1", "cluster": "test-cl", "type": "VM",
         "status": "running", "cpu": 0.1, "maxcpu": 2, "mem": 2e9, "maxmem": 4e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
        {"vmid": 101, "name": "vm2", "node": "node2", "cluster": "test-cl", "type": "VM",
         "status": "running", "cpu": 0.1, "maxcpu": 2, "mem": 1e9, "maxmem": 2e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
    ])

    res = client.get("/what-if", params={"cluster": "test-cl", "remove_node": "node1"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["total_displaced_vms"] == 1
    assert data["summary"]["migratable"] == 1
    assert data["summary"]["orphaned"] == 0
    assert data["migration_plan"][0]["target_node"] == "node2"


def test_whatif_all_nodes_removed(client, auth_headers):
    """Removing the only online node should orphan all VMs."""
    _seed_cache_with_cluster("single-cl", [
        {"name": "node1", "status": "online", "cpu": 0.5, "maxcpu": 4, "mem": 4e9, "maxmem": 8e9},
    ], [
        {"vmid": 200, "name": "lonely-vm", "node": "node1", "cluster": "single-cl", "type": "VM",
         "status": "running", "cpu": 0.2, "maxcpu": 2, "mem": 2e9, "maxmem": 4e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
    ])

    res = client.get("/what-if", params={"cluster": "single-cl", "remove_node": "node1"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["orphaned"] == 1
    assert data["summary"]["migratable"] == 0


def test_whatif_nonexistent_cluster(client, auth_headers):
    """Simulating on a non-existent cluster should return 404."""
    res = client.get("/what-if", params={"cluster": "nope", "remove_node": "node1"}, headers=auth_headers)
    assert res.status_code == 404


def test_whatif_nonexistent_node(client, auth_headers):
    """Simulating removal of a non-existent node should return 404."""
    _seed_cache_with_cluster("has-nodes", [
        {"name": "real-node", "status": "online", "cpu": 0.1, "maxcpu": 4, "mem": 1e9, "maxmem": 8e9},
    ], [])

    res = client.get("/what-if", params={"cluster": "has-nodes", "remove_node": "fake-node"}, headers=auth_headers)
    assert res.status_code == 404


def test_whatif_congestion_detection(client, auth_headers):
    """Migration that overloads a node should flag congestion."""
    _seed_cache_with_cluster("cong-cl", [
        {"name": "big", "status": "online", "cpu": 0.1, "maxcpu": 4, "mem": 1e9, "maxmem": 8e9},
        {"name": "tiny", "status": "online", "cpu": 0.5, "maxcpu": 2, "mem": 6e9, "maxmem": 8e9},
    ], [
        # 3 heavy VMs on "big"
        {"vmid": 300, "name": "heavy1", "node": "big", "cluster": "cong-cl", "type": "VM",
         "status": "running", "cpu": 0.3, "maxcpu": 2, "mem": 3e9, "maxmem": 4e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
        {"vmid": 301, "name": "heavy2", "node": "big", "cluster": "cong-cl", "type": "VM",
         "status": "running", "cpu": 0.3, "maxcpu": 2, "mem": 3e9, "maxmem": 4e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
        # 1 VM already on "tiny"
        {"vmid": 302, "name": "existing", "node": "tiny", "cluster": "cong-cl", "type": "VM",
         "status": "running", "cpu": 0.2, "maxcpu": 1, "mem": 5e9, "maxmem": 6e9,
         "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0},
    ])

    res = client.get("/what-if", params={"cluster": "cong-cl", "remove_node": "big"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    # At least some VMs should be orphaned or cause congestion because tiny is nearly full
    assert data["summary"]["orphaned"] > 0 or data["summary"]["congested_count"] > 0
