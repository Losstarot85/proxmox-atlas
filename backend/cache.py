from config import CLUSTERS

# Cache in memoria — un entry per cluster
cache = {
    cluster["name"]: {
        "nodes": [],
        "resources": [],
        "last_update": None,
        "error": None,
        "failed_nodes": []
    }
    for cluster in CLUSTERS
}
