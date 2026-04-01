from fastapi import APIRouter
from .nodes import router as nodes_router
from .resources import router as resources_router
from .network import router as network_router
from .settings import router as settings_router
from .time_machine import router as time_machine_router

router = APIRouter()
router.include_router(nodes_router)
router.include_router(resources_router)
router.include_router(network_router)
router.include_router(settings_router)
router.include_router(time_machine_router)
