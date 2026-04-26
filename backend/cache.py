from config import CLUSTERS

# Cache in memoria — un entry per cluster
cache = {
    cluster["name"]: {
        "nodes": [],
        "resources": [],
        "network": [],
        "last_update": None,
        "node_error": None,
        "resource_error": None,
        "failed_nodes": [],
    }
    for cluster in CLUSTERS
}
