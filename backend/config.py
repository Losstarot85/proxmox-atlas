import os
import json

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "clusters.json")

try:
    with open(CONFIG_PATH) as f:
        CLUSTERS = json.load(f)
except FileNotFoundError:
    print("[FATAL] clusters.json non trovato!")
    print(f"  Copia clusters.json.example in clusters.json e configuralo:")
    print(f"  cp {CONFIG_PATH}.example {CONFIG_PATH}")
    raise SystemExit(1)
except json.JSONDecodeError as e:
    print(f"[FATAL] clusters.json contiene JSON non valido: {e}")
    raise SystemExit(1)

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "settings.json")
DEFAULT_SETTINGS = {
    "polling_interval": 15,
    "webhooks": []
}

SETTINGS = DEFAULT_SETTINGS.copy()

def load_settings():
    global SETTINGS
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH) as f:
                loaded = json.load(f)
                
                # Migrate vecchi setting "webhook_url" in un element dell'array
                if "webhook_url" in loaded and loaded["webhook_url"]:
                    if "webhooks" not in loaded:
                        loaded["webhooks"] = []
                    import uuid
                    loaded["webhooks"].append({
                        "id": str(uuid.uuid4()),
                        "name": "Legacy Webhook",
                        "url": loaded["webhook_url"],
                        "severity_filter": "all",
                        "json_template": "{\"text\": \"[{{severity}}] {{message}}\"}"
                    })
                    
                if "webhook_url" in loaded:
                    del loaded["webhook_url"]
                    
                # Aggiusta i default su quelli mancanti
                for k, v in DEFAULT_SETTINGS.items():
                    if k not in loaded:
                        loaded[k] = v

                SETTINGS.update(loaded)
        else:
            save_settings(DEFAULT_SETTINGS)
    except Exception as e:
        print(f"[WARN] Impossibile caricare settings.json: {e}")

def save_settings(new_settings):
    global SETTINGS
    try:
        with open(SETTINGS_PATH, "w") as f:
            json.dump(new_settings, f, indent=2)
        SETTINGS.update(new_settings)
    except Exception as e:
        print(f"[ERROR] Impossibile salvare settings.json: {e}")

load_settings()

