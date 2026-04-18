import os
import httpx
from config import SETTINGS

PROMETHEUS_CONFIG_PATH = os.environ.get("PROMETHEUS_CONFIG_PATH", "/etc/prometheus/prometheus.yml")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://proxmox-prometheus:9090")

def generate_prometheus_config():
    """Generates the prometheus.yml file with a dynamic scrape interval aligned to polling."""
    interval = SETTINGS.get("polling_interval", 15)
    
    # Ensure the interval is not too low to avoid overloading (min 5s)
    scrape_interval = max(5, interval)
    
    config_content = f"""global:
  scrape_interval: {scrape_interval}s
  evaluation_interval: {scrape_interval}s

scrape_configs:
  - job_name: 'proxmox-atlas-backend'
    static_configs:
      - targets: ['backend:8000']
"""
    try:
        os.makedirs(os.path.dirname(PROMETHEUS_CONFIG_PATH), exist_ok=True)
        with open(PROMETHEUS_CONFIG_PATH, "w") as f:
            f.write(config_content)
        print(f"[INFO] prometheus.yml generated with scrape_interval={scrape_interval}s in {PROMETHEUS_CONFIG_PATH}")
    except Exception as e:
        print(f"[ERROR] Unable to write prometheus.yml: {e}")

async def reload_prometheus_config():
    """Sends a reload signal to Prometheus to apply the new intervals."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{PROMETHEUS_URL}/-/reload", timeout=5.0)
            response.raise_for_status()
            print("[INFO] Prometheus configuration reloaded successfully.")
    except Exception as e:
        print(f"[ERROR] Unable to reload Prometheus configuration: {e}")
