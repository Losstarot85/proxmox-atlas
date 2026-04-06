from fastapi import APIRouter
from alerts.store import get_alerts, mark_read, delete_alert, clear_alerts, silence_resource

router = APIRouter()

@router.get("/alerts")
def fetch_alerts():
    return {"alerts": get_alerts()}

@router.patch("/alerts/{alert_id}/read")
def read_alert(alert_id: str):
    mark_read(alert_id)
    return {"status": "ok"}

@router.patch("/alerts/{alert_id}/silence")
def silence_alert(alert_id: str, minutes: int = 60):
    silence_resource(alert_id, minutes)
    return {"status": "ok"}

@router.delete("/alerts/{alert_id}")
def remove_alert(alert_id: str):
    delete_alert(alert_id)
    return {"status": "ok"}

@router.delete("/alerts")
def clear_all_alerts():
    clear_alerts()
    return {"status": "ok"}

from alerts.notifier import get_webhook_logs

@router.get("/alerts/webhook_logs")
def fetch_webhook_logs():
    return {"logs": get_webhook_logs()}
