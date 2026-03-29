import httpx


async def fetch_ips_for_resource(client: httpx.AsyncClient, resource: dict, host: str, headers: dict) -> dict:
    """Recupera gli indirizzi IP di una singola VM o container LXC."""
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
