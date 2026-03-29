from fastapi import APIRouter
from cache import cache

router = APIRouter()


@router.get("/nodes")
def get_nodes():
    return {
        "clusters": [
            {
                "name": cluster_name,
                "nodes": data["nodes"],
                "last_update": data["last_update"],
                "error": data["error"]
            }
            for cluster_name, data in cache.items()
        ]
    }
