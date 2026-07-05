import time
from unittest.mock import MagicMock, patch


def test_get_backups_empty(client, auth_headers):
    """Fresh state should return empty backups list for all clusters."""
    res = client.get("/backups", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "clusters" in data
    assert len(data["clusters"]) == 0


def test_get_backups_populated(client, auth_headers):
    """Should return populated backup data from cache."""
    from cache import cache

    cache["test-cluster"] = {
        "nodes": [],
        "resources": [],
        "network": [],
        "last_update": "2026-07-05 10:00:00",
        "backups": [
            {
                "volid": "local:backup/vzdump-qemu-100-2026_07_05-10_00_00.vma.zst",
                "vmid": 100,
                "ctime": 1783245600,
                "size": 1024000,
                "format": "vma.zst",
                "node": "node1",
                "storage": "local",
            }
        ],
    }

    res = client.get("/backups", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "clusters" in data
    assert len(data["clusters"]) == 1
    assert data["clusters"][0]["name"] == "test-cluster"
    assert len(data["clusters"][0]["backups"]) == 1
    assert data["clusters"][0]["backups"][0]["vmid"] == 100


@patch("httpx.AsyncClient.get")
def test_fetch_backups_polling(mock_get, client, auth_headers):
    """Test backups polling fetches vzdump backups from Proxmox API."""
    from cache import cache
    from config import CLUSTERS

    # 1. Setup cluster configuration
    client.post(
        "/clusters",
        json={
            "name": "test-cluster",
            "host": "https://pve-mock:8006",
            "token_id": "root@pam!token",
            "token_secret": "my-secret-key-12345678",
            "verify_ssl": False,
        },
        headers=auth_headers,
    )

    # Get fresh config dict from CLUSTERS
    cluster_cfg = next(c for c in CLUSTERS if c["name"] == "test-cluster")

    # 2. Setup cached nodes with active storage pools supporting backups
    cache["test-cluster"] = {
        "nodes": [
            {
                "name": "node1",
                "status": "online",
                "storage_pools": [{"storage": "local-backup", "active": 1, "total": 1000, "used": 500, "avail": 500}],
            }
        ],
        "resources": [],
        "network": [],
        "last_update": None,
    }

    # Mock response for vzdump content (use MagicMock for synchronous json() method)
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "data": [
            {
                "volid": "local-backup:backup/vzdump-qemu-101-2026_07_05-12_00_00.vma.zst",
                "ctime": 1783245600,
                "size": 2048000,
                "vmid": 101,
                "format": "vma.zst",
                "content": "backup",
            }
        ]
    }
    mock_get.return_value = mock_res

    import asyncio

    from polling.backups import fetch_backups_from_proxmox

    asyncio.run(fetch_backups_from_proxmox(cluster_cfg))

    # Assert cache is correctly populated
    assert "backups" in cache["test-cluster"]
    backups = cache["test-cluster"]["backups"]
    assert len(backups) == 1
    assert backups[0]["vmid"] == 101
    assert backups[0]["node"] == "node1"
    assert backups[0]["storage"] == "local-backup"


def test_backup_alert_rules(client, auth_headers):
    """Test alerts are triggered for VMs with missing/outdated backups."""
    from alerts.store import alerts_store
    from cache import cache

    alerts_store.clear()

    # VM 100: No backups (Never backed up)
    # VM 101: Backup 10 days ago (Stale, limit is 7 days)
    # VM 102: Backup 2 days ago (Healthy)
    current_time = time.time()
    cache["test-cluster"] = {
        "nodes": [{"name": "node1", "status": "online"}],
        "resources": [
            {
                "vmid": 100,
                "name": "vm-never-backup",
                "node": "node1",
                "cluster": "test-cluster",
                "type": "VM",
                "status": "running",
            },
            {
                "vmid": 101,
                "name": "vm-stale-backup",
                "node": "node1",
                "cluster": "test-cluster",
                "type": "VM",
                "status": "running",
            },
            {
                "vmid": 102,
                "name": "vm-ok-backup",
                "node": "node1",
                "cluster": "test-cluster",
                "type": "VM",
                "status": "running",
            },
        ],
        "backups": [
            # VM 101 backup is 10 days old (10 * 86400 seconds ago)
            {
                "volid": "local:backup/vzdump-qemu-101-old.vma.zst",
                "vmid": 101,
                "ctime": int(current_time - 10 * 86400),
                "size": 1024,
                "format": "vma.zst",
                "node": "node1",
                "storage": "local",
            },
            # VM 102 backup is 2 days old
            {
                "volid": "local:backup/vzdump-qemu-102-new.vma.zst",
                "vmid": 102,
                "ctime": int(current_time - 2 * 86400),
                "size": 1024,
                "format": "vma.zst",
                "node": "node1",
                "storage": "local",
            },
        ],
        "network": [],
        "last_update": None,
    }

    import asyncio

    from alerts.engine import evaluate_alerts

    asyncio.run(evaluate_alerts())

    # Get active alerts
    res = client.get("/alerts", headers=auth_headers)
    assert res.status_code == 200
    alerts = res.json()["alerts"]

    # Verify vm-never-backup triggers an alert
    never_alert = next((a for a in alerts if "vm-never-backup" in a["message"]), None)
    assert never_alert is not None
    assert "never backed up" in never_alert["message"]

    # Verify vm-stale-backup triggers an alert
    stale_alert = next((a for a in alerts if "vm-stale-backup" in a["message"]), None)
    assert stale_alert is not None
    assert "no backup in 10 days" in stale_alert["message"]

    # Verify vm-ok-backup does not trigger an alert
    ok_alert = next((a for a in alerts if "vm-ok-backup" in a["message"]), None)
    assert ok_alert is None
