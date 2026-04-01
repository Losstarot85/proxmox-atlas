import os
import httpx
from config import SETTINGS

PROMETHEUS_CONFIG_PATH = os.environ.get("PROMETHEUS_CONFIG_PATH", "/etc/prometheus/prometheus.yml")
PROMETHEUS_URL = "http://proxmox-prometheus:9090"

def generate_prometheus_config():
    """Genera il file prometheus.yml con l'intervallo di scrape dinamico allineato al polling."""
    interval = SETTINGS.get("polling_interval", 15)
    
    # Assicuriamoci che l'intervallo non sia troppo basso per non sovraccaricare (min 5s)
    scrape_interval = max(5, interval)
    
    config_content = f"""global:
  scrape_interval: {scrape_interval}s
  evaluation_interval: {scrape_interval}s

scrape_configs:
  - job_name: 'proxmox-atlas-backend'
    static_configs:
      - targets: ['proxmox-backend:8000']
"""
    try:
        os.makedirs(os.path.dirname(PROMETHEUS_CONFIG_PATH), exist_ok=True)
        with open(PROMETHEUS_CONFIG_PATH, "w") as f:
            f.write(config_content)
        print(f"[INFO] prometheus.yml generato con scrape_interval={scrape_interval}s in {PROMETHEUS_CONFIG_PATH}")
    except Exception as e:
        print(f"[ERROR] Impossibile scrivere prometheus.yml: {e}")

async def reload_prometheus_config():
    """Invia il segnale di reload a Prometheus per applicare i nuovi intervalli."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{PROMETHEUS_URL}/-/reload", timeout=5.0)
            response.raise_for_status()
            print("[INFO] Configurazione Prometheus ricaricata con successo.")
    except Exception as e:
        print(f"[ERROR] Impossibile ricaricare la configurazione di Prometheus: {e}")
