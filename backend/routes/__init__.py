from fastapi import APIRouter
from routes.nodes import router as nodes_router
from routes.resources import router as resources_router
from routes.network import router as network_router

router = APIRouter()
router.include_router(nodes_router)
router.include_router(resources_router)
router.include_router(network_router)
