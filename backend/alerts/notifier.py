import asyncio
import json
import time

import httpx

from config import SETTINGS
from logger import get_logger

log = get_logger("alerts.notifier")

LOG_SIZE = 100
webhook_logs = []
dispatch_queue = None


def _get_queue():
    global dispatch_queue
    if dispatch_queue is None:
        dispatch_queue = asyncio.Queue()
    return dispatch_queue


# Webhook Log structure
# { "timestamp": float, "webhook_name": str, "url": str, "status_code": int, "success": bool, "error": str, "payload": str }


def add_log(name, url, status_code, success, error, payload):
    webhook_logs.insert(
        0,
        {
            "timestamp": time.time(),
            "webhook_name": name,
            "url": url,
            "status_code": status_code,
            "success": success,
            "error": error,
            "payload": payload,
        },
    )
    if len(webhook_logs) > LOG_SIZE:
        webhook_logs.pop()


def get_webhook_logs():
    return webhook_logs


def queue_alert(alert):
    # Alert comes from engine.py
    try:
        _get_queue().put_nowait(alert)
    except Exception as e:
        log.error("alert_enqueue_failed", error=str(e))


async def dispatch_worker():
    q = _get_queue()
    while True:
        try:
            alert = await q.get()
            webhooks = SETTINGS.get("webhooks", [])

            for index, wh in enumerate(webhooks):
                # Filter by severity
                filter_sev = wh.get("severity_filter", "all")
                if filter_sev != "all" and alert.get("severity") != filter_sev:
                    continue

                # Basic template substitution with JSON-safe escaping
                template = wh.get("json_template", '{"text": "[{{severity}}] {{message}}"}')
                # JSON-encode each value to escape quotes, newlines, backslashes etc.
                # json.dumps adds surrounding quotes, so strip them to get the inner escaped string
                safe_message = json.dumps(alert.get("message", ""))[1:-1]
                safe_severity = json.dumps(alert.get("severity", ""))[1:-1]
                safe_cluster = json.dumps(alert.get("cluster", ""))[1:-1]
                safe_node = json.dumps(alert.get("node", ""))[1:-1]
                payload_str = template.replace("{{message}}", safe_message)
                payload_str = payload_str.replace("{{severity}}", safe_severity)
                payload_str = payload_str.replace("{{cluster}}", safe_cluster)
                payload_str = payload_str.replace("{{node}}", safe_node)

                try:
                    payload = json.loads(payload_str)
                except Exception:
                    # Fallback if invalid JSON
                    payload = {"text": f"[{alert.get('severity', 'warning')}] {alert.get('message', '')}"}

                # Send with retry (max 3)
                max_retries = 3
                for attempt in range(1, max_retries + 1):
                    try:
                        async with httpx.AsyncClient(timeout=5.0) as client:
                            resp = await client.post(wh["url"], json=payload)

                            add_log(
                                wh.get("name", f"Webhook {index}"),
                                wh["url"],
                                resp.status_code,
                                resp.status_code < 400,
                                None,
                                payload_str,
                            )
                            break  # Success, esci dai retry
                    except Exception as e:
                        if attempt == max_retries:
                            add_log(wh.get("name", f"Webhook {index}"), wh["url"], 0, False, str(e), payload_str)
                        else:
                            await asyncio.sleep(2**attempt)  # backoff

            q.task_done()
        except Exception as e:
            log.error("webhook_dispatcher_error", error=str(e))
            await asyncio.sleep(5)
