from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SETTINGS, save_settings

router = APIRouter()


class Webhook(BaseModel):
    id: str
    name: str
    url: str
    severity_filter: str = "all"
    json_template: str = "{ \"text\": \"Alert: {{message}}\" }"

class SettingsUpdate(BaseModel):
    polling_interval: int
    webhooks: list[Webhook] = []

@router.get("/settings")
def get_settings():
    """Returns the current global settings."""
    return SETTINGS

@router.post("/settings")
async def update_settings(data: SettingsUpdate):
    """Updates the settings."""
    if data.polling_interval < 5:
        raise HTTPException(status_code=400, detail="Minimum polling interval is 5 seconds to avoid overloading Proxmox.")

    new_settings = {
        "polling_interval": data.polling_interval,
        "webhooks": [w.model_dump() for w in data.webhooks]
    }

    save_settings(new_settings)

    from prometheus_config import generate_prometheus_config, reload_prometheus_config
    generate_prometheus_config()
    await reload_prometheus_config()

    return {"message": "Settings updated successfully", "settings": SETTINGS}
