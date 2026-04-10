from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio

from polling import poll_proxmox
from routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from prometheus_config import generate_prometheus_config
    from alerts.notifier import dispatch_worker
    # Generate the Prometheus config at startup, ensuring it's in sync with polling
    generate_prometheus_config()
    
    task = asyncio.create_task(poll_proxmox())
    notifier_task = asyncio.create_task(dispatch_worker())
    yield
    task.cancel()
    notifier_task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Proxmox Atlas",
    description="Multi-cluster monitoring dashboard for Proxmox VE",
    lifespan=lifespan
)

from prometheus_client import make_asgi_app
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)



@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}


app.include_router(router)