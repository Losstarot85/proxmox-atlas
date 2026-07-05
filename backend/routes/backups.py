from fastapi import APIRouter

from cache import cache

router = APIRouter()


@router.get("/backups")
def get_backups():
    """Returns the aggregated list of backups from all clusters."""
    return {
        "clusters": [
            {
                "name": cluster_name,
                "backups": data.get("backups", []),
                "last_update": data.get("last_update"),
            }
            for cluster_name, data in cache.items()
        ]
    }
