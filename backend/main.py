from logger import get_logger, setup_logging

setup_logging()
log = get_logger("main")

import asyncio
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from auth import init_auth
from polling import poll_proxmox
from routes import auth_public_router, router, stream_public_router
from routes.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from alerts.notifier import dispatch_worker
    from prometheus_config import generate_prometheus_config

    # Initialize auth system (creates admin on first deploy)
    init_auth()

    # Generate the Prometheus config at startup, ensuring it's in sync with polling
    generate_prometheus_config()

    log.info("atlas_started", message="Proxmox Atlas backend ready")

    task = asyncio.create_task(poll_proxmox())
    notifier_task = asyncio.create_task(dispatch_worker())
    yield
    task.cancel()
    notifier_task.cancel()
    for t in (task, notifier_task):
        try:
            await t
        except asyncio.CancelledError:
            pass
    log.info("atlas_stopped")


app = FastAPI(
    title="Proxmox Atlas",
    description="Multi-cluster monitoring dashboard for Proxmox VE",
    lifespan=lifespan
)


# ── Global Exception Handler ──
@app.middleware("http")
async def catch_unhandled_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        log.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error=str(exc),
            traceback=traceback.format_exc()
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )


from prometheus_client import make_asgi_app

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/")
def root():
    return {"message": "Proxmox Atlas backend running"}

# Public health check (no auth required — needed for Docker healthcheck & monitoring)
app.include_router(health_router)

# Public auth routes (no token required)
app.include_router(auth_public_router)

# Special SSE stream route (token via query param, not header)
app.include_router(stream_public_router)

# Protected API routes (require valid JWT in Bearer Header)
app.include_router(router)
