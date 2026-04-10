import asyncio
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sse import broker
import json
from cache import cache

router = APIRouter()

@router.get("/stream")
async def sse_stream():
    """Endpoint Server-Sent Events per trasmettere in tempo reale gli aggiornamenti della cache"""
    
    async def event_generator():
        # Appena collegati, mandiamo subito lo stato corrente della cache per boot veloce!
        results_by_cluster = []
        for cluster_name, data in cache.items():
            results_by_cluster.append({
                "name": cluster_name,
                "nodes": data.get("nodes", []),
                "resources": data.get("resources", []),
                "last_update": data.get("last_update"),
                "error": data.get("error"),
                "failed_nodes": data.get("failed_nodes", [])
            })
        
        initial_payload = json.dumps({"clusters": results_by_cluster})
        yield f"data: {initial_payload}\n\n"
        
        q = broker.add_client()
        try:
            while True:
                # Aspettiamo il prossimo broadcast
                data = await q.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            # Utente disconnesso (chiuso browser o disattivato tab)
            raise
        finally:
            broker.remove_client(q)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
