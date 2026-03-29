from fastapi import APIRouter
from cache import cache

router = APIRouter()


@router.get("/resources")
def get_resources():
    return {
        "clusters": [
            {
                "name": cluster_name,
                "resources": data["resources"],
                "last_update": data["last_update"],
                "error": data["error"],
                "failed_nodes": data["failed_nodes"]
            }
            for cluster_name, data in cache.items()
        ]
    }
