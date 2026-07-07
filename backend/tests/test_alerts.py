"""Tests for the alerts system."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_get_alerts_empty(client, auth_headers):
    """Fresh install should have no alerts."""
    res = client.get("/alerts", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "alerts" in data
    assert isinstance(data["alerts"], list)


def test_dismiss_alert(client, auth_headers):
    """Dismissing an alert by ID should work."""
    from alerts.store import alerts_store

    test_alert = {
        "id": "test-alert-1",
        "key": "test:alert:1",
        "cluster": "test-cl",
        "node": "node1",
        "resource": "VM 100 (test-vm)",
        "severity": "warning",
        "message": "Test alert",
        "timestamp": 1700000000,
        "read": False,
    }
    alerts_store.insert(0, test_alert)

    # Verify it appears
    res = client.get("/alerts", headers=auth_headers)
    alerts = res.json()["alerts"]
    assert any(a["id"] == "test-alert-1" for a in alerts)

    # Dismiss it
    res = client.delete("/alerts/test-alert-1", headers=auth_headers)
    assert res.status_code == 200

    # Verify it's gone
    res = client.get("/alerts", headers=auth_headers)
    alerts = res.json()["alerts"]
    assert not any(a["id"] == "test-alert-1" for a in alerts)


def test_clear_all_alerts(client, auth_headers):
    """Clear all should remove every alert."""
    from alerts.store import alerts_store

    # Inject multiple alerts
    for i in range(5):
        alerts_store.insert(
            0,
            {
                "id": f"bulk-{i}",
                "key": f"bulk:{i}",
                "cluster": "cl",
                "node": "n",
                "resource": "NODE",
                "severity": "info",
                "message": f"Alert {i}",
                "timestamp": 1700000000 + i,
                "read": False,
            },
        )

    res = client.get("/alerts", headers=auth_headers)
    assert len(res.json()["alerts"]) >= 5

    res = client.delete("/alerts", headers=auth_headers)
    assert res.status_code == 200

    res = client.get("/alerts", headers=auth_headers)
    assert len(res.json()["alerts"]) == 0


def test_health_endpoint(client):
    """Health endpoint should be accessible without auth."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["components"]["backend"]["status"] == "ok"
    assert "prometheus" in data["components"]


def test_alert_rules_endpoints(client, auth_headers):
    """Test get and set alert rules endpoints."""
    # Get current rules
    res = client.get("/alerts/rules", headers=auth_headers)
    assert res.status_code == 200
    rules = res.json()
    assert "cpu_threshold_percent" in rules
    assert "ram_threshold_percent" in rules
    assert "enabled_rules" in rules

    # Modify rules
    rules["cpu_threshold_percent"] = 77
    rules["enabled_rules"]["cpu"] = False
    rules["overrides"] = {
        "test-cl:100": {
            "cpu_threshold_percent": 99
        }
    }

    # Save rules
    res = client.post("/alerts/rules", json=rules, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # Fetch again to verify persistence
    res = client.get("/alerts/rules", headers=auth_headers)
    assert res.status_code == 200
    updated_rules = res.json()
    assert updated_rules["cpu_threshold_percent"] == 77
    assert updated_rules["enabled_rules"]["cpu"] is False
    assert updated_rules["overrides"]["test-cl:100"]["cpu_threshold_percent"] == 99

    # Clean up rules by restoring defaults
    rules["cpu_threshold_percent"] = 85
    rules["enabled_rules"]["cpu"] = True
    rules["overrides"] = {}
    client.post("/alerts/rules", json=rules, headers=auth_headers)


def test_smart_alert_grouping(client, auth_headers):
    """Test that >= 3 VM alerts on the same node are grouped into a single alert."""
    import asyncio

    from alerts.engine import active_alerts, evaluate_alerts
    from alerts.store import alerts_store
    from cache import cache

    alerts_store.clear()
    active_alerts.clear()

    # Configure cache with 3 VMs violating CPU thresholds on node1
    cache["group-cluster"] = {
        "nodes": [{"name": "node1", "status": "online"}],
        "resources": [
            {"vmid": 100, "name": "vm-100", "node": "node1", "cluster": "group-cluster", "type": "VM", "status": "running", "cpu": 0.99},
            {"vmid": 101, "name": "vm-101", "node": "node1", "cluster": "group-cluster", "type": "VM", "status": "running", "cpu": 0.95},
            {"vmid": 102, "name": "vm-102", "node": "node1", "cluster": "group-cluster", "type": "VM", "status": "running", "cpu": 0.92},
        ],
        "backups": [],
        "network": [],
        "last_update": None,
    }

    asyncio.run(evaluate_alerts())

    res = client.get("/alerts", headers=auth_headers)
    alerts = res.json()["alerts"]

    # Verify a single grouped alert was created instead of 3 individual ones
    grouped_alert = next((a for a in alerts if "VM GROUP" in a["resource"]), None)
    assert grouped_alert is not None
    assert "3 VMs on node node1 have high CPU" in grouped_alert["message"]

    # Ensure individual alerts did not fire
    individual_alerts = [a for a in alerts if "High CPU usage on VM" in a["message"]]
    assert len(individual_alerts) == 0


def test_node_down_suppression(client, auth_headers):
    """Test that individual VM offline alerts are suppressed when their host node is down."""
    import asyncio

    from alerts.engine import active_alerts, evaluate_alerts, previous_states
    from alerts.store import alerts_store
    from cache import cache

    alerts_store.clear()
    active_alerts.clear()
    previous_states.clear()

    # Pre-populate previous state as online/running to trigger status transition
    previous_states["suppress-cluster:node1:node"] = "online"
    previous_states["suppress-cluster:100:vm"] = "running"
    previous_states["suppress-cluster:101:vm"] = "running"

    # Configure cache: node1 goes offline, causing VMs to also appear stopped
    cache["suppress-cluster"] = {
        "nodes": [{"name": "node1", "status": "offline"}],
        "resources": [
            {"vmid": 100, "name": "vm-100", "node": "node1", "cluster": "suppress-cluster", "type": "VM", "status": "stopped"},
            {"vmid": 101, "name": "vm-101", "node": "node1", "cluster": "suppress-cluster", "type": "VM", "status": "stopped"},
        ],
        "backups": [],
        "network": [],
        "last_update": None,
    }

    asyncio.run(evaluate_alerts())

    res = client.get("/alerts", headers=auth_headers)
    alerts = res.json()["alerts"]

    # Verify node offline alert was triggered
    node_alert = next((a for a in alerts if "Node node1 is OFFLINE" in a["message"]), None)
    assert node_alert is not None

    # Verify VM offline alerts were suppressed
    vm_alerts = [a for a in alerts if "Unexpected VM Stop" in a["message"]]
    assert len(vm_alerts) == 0


def test_alert_flap_detection(client, auth_headers):
    """Test that rapid toggling of a metric suppresses alerts via flap detection."""
    import asyncio

    from alerts.engine import active_alerts, evaluate_alerts, flap_history, rule_states
    from alerts.store import alerts_store
    from cache import cache

    alerts_store.clear()
    active_alerts.clear()
    flap_history.clear()
    rule_states.clear()

    # Define base node parameters
    cache["flap-cluster"] = {
        "nodes": [{"name": "node1", "status": "online", "cpu": 0.1}],
        "resources": [],
        "backups": [],
        "network": [],
        "last_update": None,
    }

    # Simulate rapid toggling (violating -> healthy -> violating -> healthy -> violating)
    # Transition 1: cpu goes high (violating)
    cache["flap-cluster"]["nodes"][0]["cpu"] = 0.95
    asyncio.run(evaluate_alerts())
    assert len(alerts_store) == 1  # Alert triggered
    alerts_store.clear()
    active_alerts.clear()  # Clear cooldown so it can trigger again

    # Transition 2: cpu goes low (healthy)
    cache["flap-cluster"]["nodes"][0]["cpu"] = 0.10
    asyncio.run(evaluate_alerts())
    assert len(alerts_store) == 0

    # Transition 3: cpu goes high again (violating)
    cache["flap-cluster"]["nodes"][0]["cpu"] = 0.95
    asyncio.run(evaluate_alerts())
    assert len(alerts_store) == 1
    alerts_store.clear()
    active_alerts.clear()

    # Transition 4: cpu goes low (healthy)
    cache["flap-cluster"]["nodes"][0]["cpu"] = 0.10
    asyncio.run(evaluate_alerts())
    assert len(alerts_store) == 0

    # Transition 5: cpu goes high again (violating) - Flapping should suppress it!
    cache["flap-cluster"]["nodes"][0]["cpu"] = 0.95
    asyncio.run(evaluate_alerts())
    assert len(alerts_store) == 0  # Suppressed!


