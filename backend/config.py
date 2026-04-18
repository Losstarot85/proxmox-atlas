import os
import json

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
CONFIG_PATH = os.path.join(DATA_DIR, "clusters.json")

try:
    with open(CONFIG_PATH) as f:
        CLUSTERS = json.load(f)
except FileNotFoundError:
    print(f"[INFO] {CONFIG_PATH} not found. Initialized an empty cluster database.")
    CLUSTERS = []
    try:
        with open(CONFIG_PATH, "w") as f:
            json.dump(CLUSTERS, f, indent=2)
    except Exception as e:
        print(f"[ERROR] Unable to create {CONFIG_PATH}: {e}")
except json.JSONDecodeError as e:
    print(f"[FATAL] clusters.json contains invalid JSON: {e}")
    raise SystemExit(1)

SETTINGS_PATH = os.path.join(DATA_DIR, "settings.json")
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
                
                # Migrate legacy "webhook_url" setting into the webhooks array
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
                    
                # Fill in missing defaults
                for k, v in DEFAULT_SETTINGS.items():
                    if k not in loaded:
                        loaded[k] = v

                SETTINGS.update(loaded)
        else:
            save_settings(DEFAULT_SETTINGS)
    except Exception as e:
        print(f"[WARN] Unable to load settings.json: {e}")

def save_settings(new_settings):
    global SETTINGS
    try:
        with open(SETTINGS_PATH, "w") as f:
            json.dump(new_settings, f, indent=2)
        SETTINGS.update(new_settings)
    except Exception as e:
        print(f"[ERROR] Unable to save settings.json: {e}")

load_settings()

