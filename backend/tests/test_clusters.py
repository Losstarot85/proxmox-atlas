"""Tests for cluster CRUD operations."""


def test_list_clusters_empty(client, auth_headers):
    """Empty cluster list on fresh install."""
    res = client.get("/clusters", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["clusters"] == []


def test_add_cluster(client, auth_headers):
    """Adding a cluster should persist and appear in the list."""
    res = client.post(
        "/clusters",
        json={
            "name": "test-cluster",
            "host": "https://pve.example.com:8006",
            "token_id": "user@pam!mytoken",
            "token_secret": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "verify_ssl": False,
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "created"

    # Verify it appears in the list
    res = client.get("/clusters", headers=auth_headers)
    clusters = res.json()["clusters"]
    assert len(clusters) == 1
    assert clusters[0]["name"] == "test-cluster"
    # Token secret should be masked in GET
    assert "••••••••" in clusters[0]["token_secret_masked"]


def test_add_duplicate_cluster(client, auth_headers):
    """Adding a cluster with duplicate name should fail with 409."""
    payload = {
        "name": "dup-cluster",
        "host": "https://pve1.example.com:8006",
        "token_id": "user@pam!tok1",
        "token_secret": "11111111-2222-3333-4444-555555555555",
    }
    res = client.post("/clusters", json=payload, headers=auth_headers)
    assert res.status_code == 200

    res = client.post("/clusters", json=payload, headers=auth_headers)
    assert res.status_code == 409


def test_delete_cluster(client, auth_headers):
    """Deleting a cluster should remove it from the list."""
    # Add first
    client.post(
        "/clusters",
        json={
            "name": "to-delete",
            "host": "https://pve.example.com:8006",
            "token_id": "user@pam!tok",
            "token_secret": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
        headers=auth_headers,
    )

    # Delete
    res = client.delete("/clusters/to-delete", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "deleted"

    # Verify gone
    res = client.get("/clusters", headers=auth_headers)
    names = [c["name"] for c in res.json()["clusters"]]
    assert "to-delete" not in names


def test_delete_nonexistent_cluster(client, auth_headers):
    """Deleting a cluster that doesn't exist should return 404."""
    res = client.delete("/clusters/no-such-cluster", headers=auth_headers)
    assert res.status_code == 404
