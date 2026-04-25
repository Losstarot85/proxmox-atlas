import os
import json
import re
from logger import get_logger

log = get_logger("config")

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
CONFIG_PATH = os.path.join(DATA_DIR, "clusters.json")

try:
    with open(CONFIG_PATH) as f:
        CLUSTERS = json.load(f)
except FileNotFoundError:
    log.info("clusters_file_not_found", path=CONFIG_PATH)
    CLUSTERS = []
    try:
        with open(CONFIG_PATH, "w") as f:
            json.dump(CLUSTERS, f, indent=2)
    except Exception as e:
        log.error("clusters_file_create_failed", path=CONFIG_PATH, error=str(e))
except json.JSONDecodeError as e:
    log.error("clusters_json_invalid", path=CONFIG_PATH, error=str(e))
    raise SystemExit(1)


def _resolve_env_vars(value: str) -> str:
    """Resolve ${ENV:VAR_NAME} placeholders to environment variable values."""
    def replacer(match):
        var_name = match.group(1)
        env_val = os.environ.get(var_name)
        if env_val is None:
            log.warning("env_var_not_found", variable=var_name)
            return match.group(0)  # Leave placeholder as-is
        return env_val
    return re.sub(r'\$\{ENV:([^}]+)\}', replacer, value)


def resolve_cluster_secrets(cluster: dict) -> dict:
    """Return a copy of the cluster config with env var placeholders resolved."""
    resolved = dict(cluster)
    for key in ("token_id", "token_secret", "host"):
        if key in resolved and isinstance(resolved[key], str):
            resolved[key] = _resolve_env_vars(resolved[key])
    return resolved

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
        log.warning("settings_load_failed", error=str(e))

def save_settings(new_settings):
    global SETTINGS
    try:
        with open(SETTINGS_PATH, "w") as f:
            json.dump(new_settings, f, indent=2)
        SETTINGS.update(new_settings)
    except Exception as e:
        log.error("settings_save_failed", error=str(e))

load_settings()

