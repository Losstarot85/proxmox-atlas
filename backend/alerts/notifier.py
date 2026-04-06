import asyncio
import time
import json
import httpx
import logging
from config import SETTINGS

LOG_SIZE = 100
webhook_logs = []
dispatch_queue = asyncio.Queue()

# Struttura del Webhook Log
# { "timestamp": float, "webhook_name": str, "url": str, "status_code": int, "success": bool, "error": str, "payload": str }

def add_log(name, url, status_code, success, error, payload):
    webhook_logs.insert(0, {
        "timestamp": time.time(),
        "webhook_name": name,
        "url": url,
        "status_code": status_code,
        "success": success,
        "error": error,
        "payload": payload
    })
    if len(webhook_logs) > LOG_SIZE:
        webhook_logs.pop()

def get_webhook_logs():
    return webhook_logs

def queue_alert(alert):
    # L'alert arriva da engine.py
    try:
        dispatch_queue.put_nowait(alert)
    except Exception as e:
        logging.error(f"Cannot enqueue alert for webhook dispatch: {e}")

async def dispatch_worker():
    while True:
        try:
            alert = await dispatch_queue.get()
            webhooks = SETTINGS.get("webhooks", [])
            
            for index, wh in enumerate(webhooks):
                # Filtra per severity
                filter_sev = wh.get("severity_filter", "all")
                if filter_sev != "all" and alert.get("severity") != filter_sev:
                    continue
                
                # Sostituzione Template base
                template = wh.get("json_template", "{\"text\": \"[{{severity}}] {{message}}\"}")
                payload_str = template.replace("{{message}}", alert.get("message", ""))
                payload_str = payload_str.replace("{{severity}}", alert.get("severity", ""))
                payload_str = payload_str.replace("{{cluster}}", alert.get("cluster", ""))
                payload_str = payload_str.replace("{{node}}", alert.get("node", ""))
                
                try:
                    payload = json.loads(payload_str)
                except Exception:
                    # Fallback if invalid JSON
                    payload = {"text": f"Error parsing template JSON: {payload_str}"}

                # Invio con retry (max 3)
                max_retries = 3
                for attempt in range(1, max_retries + 1):
                    try:
                        async with httpx.AsyncClient(timeout=5.0) as client:
                            resp = await client.post(wh["url"], json=payload)
                            
                            add_log(wh.get("name", f"Webhook {index}"), wh["url"], resp.status_code, resp.status_code < 400, None, payload_str)
                            break # Success, esci dai retry
                    except Exception as e:
                        if attempt == max_retries:
                            add_log(wh.get("name", f"Webhook {index}"), wh["url"], 0, False, str(e), payload_str)
                        else:
                            await asyncio.sleep(2 ** attempt) # backoff
            
            dispatch_queue.task_done()
        except Exception as e:
            logging.error(f"Webhook dispatcher worker error: {e}")
            await asyncio.sleep(5)
