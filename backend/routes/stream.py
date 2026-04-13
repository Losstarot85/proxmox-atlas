import asyncio
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from sse import broker, _enrich_resources_with_ips
import json
from cache import cache
from auth import decode_token
import jwt

router = APIRouter()

@router.get("/stream")
async def sse_stream(request: Request, token: str = ""):
    """Server-Sent Events endpoint for real-time cache update streaming.
    
    Accepts JWT token via query parameter since EventSource API
    does not support custom HTTP headers.
    """
    # Validate token from query param (EventSource can't send headers)
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")
    
    async def event_generator():
        # On first connect, immediately send the current cache state for fast boot!
        results_by_cluster = []
        for cluster_name, data in cache.items():
            results_by_cluster.append({
                "name": cluster_name,
                "nodes": data.get("nodes", []),
                "resources": _enrich_resources_with_ips(cluster_name, data.get("resources", [])),
                "last_update": data.get("last_update"),
                "error": data.get("error"),
                "failed_nodes": data.get("failed_nodes", [])
            })
        
        initial_payload = json.dumps({"clusters": results_by_cluster})
        yield f"data: {initial_payload}\n\n"
        
        q = broker.add_client()
        try:
            while True:
                # Wait for the next broadcast
                data = await q.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            # Client disconnected (closed browser or deactivated tab)
            raise
        finally:
            broker.remove_client(q)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
