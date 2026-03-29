from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import SETTINGS, save_settings

router = APIRouter()

class SettingsUpdate(BaseModel):
    polling_interval: int

@router.get("/settings")
def get_settings():
    """Ritorna le impostazioni globali attuali."""
    return SETTINGS

@router.post("/settings")
def update_settings(data: SettingsUpdate):
    """Aggiorna le impostazioni."""
    if data.polling_interval < 5:
        raise HTTPException(status_code=400, detail="Il polling interval minimo consentito è 5 secondi per non sovraccaricare Proxmox.")
    
    new_settings = {
        "polling_interval": data.polling_interval
    }
    
    save_settings(new_settings)
    return {"message": "Impostazioni aggiornate con successo", "settings": SETTINGS}
