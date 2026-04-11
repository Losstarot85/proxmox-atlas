from fastapi import APIRouter
from .nodes import router as nodes_router
from .resources import router as resources_router
from .settings import router as settings_router
from .time_machine import router as time_machine_router
from .stream import router as stream_router
from .alerts import router as alerts_router
from .whatif import router as whatif_router
from .clusters import router as clusters_router

router = APIRouter()
router.include_router(nodes_router)
router.include_router(resources_router)
router.include_router(settings_router)
router.include_router(time_machine_router)
router.include_router(stream_router)
router.include_router(alerts_router)
router.include_router(whatif_router)
router.include_router(clusters_router)
