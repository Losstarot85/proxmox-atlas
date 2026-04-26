from fastapi import APIRouter, Depends

from auth import get_current_user

from .alerts import router as alerts_router
from .auth import router as auth_router
from .clusters import router as clusters_router
from .nodes import router as nodes_router
from .resources import router as resources_router
from .settings import router as settings_router
from .stream import router as stream_router
from .time_machine import router as time_machine_router
from .whatif import router as whatif_router

# Auth routes are public (no token required)
auth_public_router = APIRouter()
auth_public_router.include_router(auth_router)

# Stream route is "public" in terms of Headers, because it uses query param authentication!
stream_public_router = APIRouter()
stream_public_router.include_router(stream_router)

# All other routes require authentication via HTTP Bearer Header
router = APIRouter(dependencies=[Depends(get_current_user)])
router.include_router(nodes_router)
router.include_router(resources_router)
router.include_router(settings_router)
router.include_router(time_machine_router)
router.include_router(alerts_router)
router.include_router(whatif_router)
router.include_router(clusters_router)
