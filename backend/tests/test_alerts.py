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

