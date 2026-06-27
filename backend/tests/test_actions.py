from unittest.mock import AsyncMock, patch


def test_action_no_auth(client):
    """Actions route should require authentication."""
    res = client.post("/actions/test-cluster/node1/VM/100/start")
    assert res.status_code == 401


def test_action_viewer_forbidden(client, auth_headers):
    """A viewer user should be forbidden (403) from triggering actions."""
    # 1. Create a viewer user
    res = client.post(
        "/users",
        json={"username": "test_viewer", "password": "password123", "role": "viewer"},
        headers=auth_headers,
    )
    assert res.status_code == 200

    # 2. Login as the viewer
    res = client.post("/auth/login", json={"username": "test_viewer", "password": "password123"})
    assert res.status_code == 200
    viewer_token = res.json()["token"]
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    # 3. Request action
    res = client.post("/actions/test-cluster/node1/VM/100/start", headers=viewer_headers)
    assert res.status_code == 403


def test_action_invalid_action(client, auth_headers):
    """An invalid action name should return 400."""
    res = client.post("/actions/test-cluster/node1/VM/100/explode", headers=auth_headers)
    assert res.status_code == 400


def test_action_invalid_type(client, auth_headers):
    """An invalid resource type should return 400."""
    res = client.post("/actions/test-cluster/node1/Storage/100/start", headers=auth_headers)
    assert res.status_code == 400


def test_action_nonexistent_cluster(client, auth_headers):
    """Action on a cluster that is not configured should return 404."""
    res = client.post("/actions/nonexistent-cluster/node1/VM/100/start", headers=auth_headers)
    assert res.status_code == 404


@patch("fastapi.BackgroundTasks.add_task")
@patch("httpx.AsyncClient.post")
def test_action_success_mocked(mock_post, mock_add_task, client, auth_headers):
    from cache import cache

    """Action call should pass validation, fetch configuration, make mock POST, and return 200."""
    # 1. Configure test cluster
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

    # 2. Setup mock resources in cache so sanity check passes and updates optimistically
    cache["test-cluster"] = {
        "nodes": [{"name": "node1", "status": "online"}],
        "resources": [
            {
                "vmid": 100,
                "name": "test-vm",
                "node": "node1",
                "cluster": "test-cluster",
                "type": "VM",
                "status": "stopped",
            }
        ],
        "network": [],
        "last_update": None,
        "failed_nodes": [],
    }

    # 3. Mock the Proxmox status POST response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": "UPID:node1:0000:0000:0000:qemustart:100:root@pam:"}
    mock_post.return_value = mock_response

    # 4. Trigger the action
    res = client.post("/actions/test-cluster/node1/VM/100/start", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Verify optimistic update worked: cache status changed to running
    assert cache["test-cluster"]["resources"][0]["status"] == "running"

    # Verify that the mocked post was called with correct Proxmox URL
    mock_post.assert_called_once()
    called_url = mock_post.call_args[0][0]
    assert "https://pve-mock:8006/api2/json/nodes/node1/qemu/100/status/start" in called_url
