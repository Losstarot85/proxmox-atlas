from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio

from polling import poll_proxmox
from routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(poll_proxmox())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Proxmox Atlas",
    description="Multi-cluster monitoring dashboard for Proxmox VE",
    lifespan=lifespan
)


@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}


app.include_router(router)