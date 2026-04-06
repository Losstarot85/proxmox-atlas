from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import SETTINGS, save_settings

router = APIRouter()

from typing import List, Optional

class Webhook(BaseModel):
    id: str
    name: str
    url: str
    severity_filter: str = "all"
    json_template: str = "{ \"text\": \"Alert: {{message}}\" }"

class SettingsUpdate(BaseModel):
    polling_interval: int
    webhooks: List[Webhook] = []

@router.get("/settings")
def get_settings():
    """Ritorna le impostazioni globali attuali."""
    return SETTINGS

@router.post("/settings")
async def update_settings(data: SettingsUpdate):
    """Aggiorna le impostazioni."""
    if data.polling_interval < 5:
        raise HTTPException(status_code=400, detail="Il polling interval minimo consentito è 5 secondi per non sovraccaricare Proxmox.")
    
    new_settings = {
        "polling_interval": data.polling_interval,
        "webhooks": [w.dict() for w in data.webhooks]
    }
    
    save_settings(new_settings)
    
    from prometheus_config import generate_prometheus_config, reload_prometheus_config
    generate_prometheus_config()
    await reload_prometheus_config()
    
    return {"message": "Impostazioni aggiornate con successo", "settings": SETTINGS}
