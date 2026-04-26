"""
Test fixtures for Proxmox Atlas backend.
Provides a FastAPI test client and isolated auth/config state.
"""

import os
import sys

import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    """Redirect all data files to a temporary directory for test isolation."""
    data_dir = str(tmp_path)
    monkeypatch.setenv("DATA_DIR", data_dir)
    monkeypatch.setenv("PROMETHEUS_URL", "http://localhost:19090")
    monkeypatch.setenv("PROMETHEUS_CONFIG_PATH", os.path.join(data_dir, "prometheus.yml"))
    return data_dir


@pytest.fixture
def app(isolated_data_dir):
    """Create a fresh FastAPI app instance for testing."""
    # Clear cached modules to get fresh state with new DATA_DIR
    modules_to_clear = [
        "config",
        "cache",
        "auth",
        "main",
        "polling",
        "polling.nodes",
        "polling.resources",
        "polling.network",
        "sse",
        "metrics",
        "prometheus_config",
        "alerts.engine",
        "alerts.store",
        "alerts.anomaly",
        "alerts.notifier",
        "routes",
        "routes.auth",
        "routes.nodes",
        "routes.resources",
        "routes.settings",
        "routes.time_machine",
        "routes.stream",
        "routes.alerts",
        "routes.whatif",
        "routes.clusters",
        "routes.health",
    ]
    for mod in modules_to_clear:
        if mod in sys.modules:
            del sys.modules[mod]

    from auth import init_auth
    from main import app as fastapi_app

    init_auth()

    return fastapi_app


@pytest.fixture
def client(app):
    """Synchronous test client."""
    from fastapi.testclient import TestClient

    return TestClient(app)


@pytest.fixture
def auth_token(client):
    """Get a valid JWT token by logging in with default credentials."""
    res = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers with valid JWT."""
    return {"Authorization": f"Bearer {auth_token}"}
