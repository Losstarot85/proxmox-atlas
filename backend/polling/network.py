import httpx


async def fetch_ips_for_resource(client: httpx.AsyncClient, resource: dict, host: str, headers: dict) -> dict:
    """Retrieves the IP addresses of a single VM or LXC container."""
    node = resource["node"]
    vmid = resource["vmid"]
    r_type = resource["type"]
    name = resource["name"]

    result = {
        "vmid": vmid,
        "name": name,
        "node": node,
        "cluster": resource["cluster"],
        "type": r_type,
        "agent_available": False,
        "ips": []
    }

    try:
        if r_type == "VM":
            url = f"{host}/api2/json/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces"
            res = await client.get(url, headers=headers, timeout=3.0)
            res.raise_for_status()
            interfaces = res.json().get("data", {}).get("result", [])
            result["agent_available"] = True

            for iface in interfaces:
                if iface.get("name") == "lo":
                    continue
                for ip_info in iface.get("ip-addresses", []):
                    if ip_info.get("ip-address-type") == "ipv4":
                        result["ips"].append({
                            "interface": iface.get("name"),
                            "ip": ip_info.get("ip-address"),
                            "prefix": ip_info.get("prefix")
                        })

        elif r_type == "LXC":
            url = f"{host}/api2/json/nodes/{node}/lxc/{vmid}/interfaces"
            res = await client.get(url, headers=headers, timeout=3.0)
            res.raise_for_status()
            interfaces = res.json().get("data", [])
            result["agent_available"] = True

            for iface in interfaces:
                if iface.get("name") == "lo":
                    continue
                inet = iface.get("inet", "")
                if inet:
                    ip = inet.split("/")[0]
                    prefix = inet.split("/")[1] if "/" in inet else None
                    result["ips"].append({
                        "interface": iface.get("name"),
                        "ip": ip,
                        "prefix": prefix
                    })

    except httpx.TimeoutException:
        result["agent_available"] = False
    except Exception:
        result["agent_available"] = False

    return result

import asyncio

from cache import cache
from logger import get_logger

log = get_logger("polling.network")

async def update_network_ips_for_cluster(cluster: dict):
    from config import resolve_cluster_secrets
    cluster = resolve_cluster_secrets(cluster)
    cluster_name = cluster["name"]
    host = cluster["host"]
    headers = {"Authorization": f"PVEAPIToken={cluster['token_id']}={cluster['token_secret']}"}
    verify_ssl = cluster.get("verify_ssl", False)

    running_resources = [
        r for r in cache[cluster_name].get("resources", [])
        if r.get("status") == "running"
    ]

    if not running_resources:
        cache[cluster_name]["network"] = []
        return

    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0) as client:
            sem = asyncio.Semaphore(10)

            async def fetch_with_sem(r):
                async with sem:
                    return await fetch_ips_for_resource(client, r, host, headers)

            tasks = [fetch_with_sem(r) for r in running_resources]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            valid_results = [res for res in results if not isinstance(res, Exception)]
            cache[cluster_name]["network"] = valid_results
    except Exception as e:
        log.error("network_polling_error", cluster=cluster_name, error=str(e))
