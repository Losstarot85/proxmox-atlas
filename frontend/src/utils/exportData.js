/**
 * Utility di export per snapshot della dashboard in JSON e CSV.
 * Opera interamente lato client serializzando lo state React.
 */

function getDateStamp() {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports the full cluster state as structured JSON.
 */
export function exportJSON(clusters) {
  const snapshot = {
    exported_at: new Date().toISOString(),
    generator: "Proxmox Atlas",
    cluster_count: clusters.length,
    clusters: clusters.map(c => ({
      name: c.name,
      last_update: c.last_update,
      error: c.error,
      nodes: (c.nodes || []).map(n => ({
        name: n.name,
        status: n.status,
        cpu_ratio: n.cpu,
        maxcpu: n.maxcpu,
        mem_used: n.mem,
        maxmem: n.maxmem,
        uptime: n.uptime,
        loadavg: n.loadavg,
        netin: n.netin,
        netout: n.netout,
        iowait: n.iowait
      })),
      resources: (c.resources || []).map(r => ({
        vmid: r.vmid,
        name: r.name,
        type: r.type,
        node: r.node,
        status: r.status,
        cpu_ratio: r.cpu,
        maxcpu: r.maxcpu,
        mem_used: r.mem,
        maxmem: r.maxmem,
        uptime: r.uptime,
        netin: r.netin,
        netout: r.netout,
        diskread: r.diskread,
        diskwrite: r.diskwrite
      }))
    }))
  };

  const json = JSON.stringify(snapshot, null, 2);
  triggerDownload(json, `atlas-snapshot-${getDateStamp()}.json`, "application/json");
}

/**
 * Exports a flat inventory of nodes and resources in CSV format.
 */
export function exportCSV(clusters) {
  const rows = [];

  // Header
  rows.push([
    "Cluster", "Type", "Name", "VMID", "Node", "Status",
    "CPU%", "vCPU", "RAM Used (GB)", "RAM Total (GB)",
    "Net In", "Net Out", "Uptime (h)"
  ].join(","));

  for (const c of clusters) {
    // Nodi
    for (const n of (c.nodes || [])) {
      rows.push([
        esc(c.name),
        "NODE",
        esc(n.name),
        "",
        "",
        n.status,
        n.cpu != null ? (n.cpu * 100).toFixed(1) : "",
        n.maxcpu || "",
        n.mem ? (n.mem / 1073741824).toFixed(2) : "",
        n.maxmem ? (n.maxmem / 1073741824).toFixed(2) : "",
        n.netin || 0,
        n.netout || 0,
        n.uptime ? (n.uptime / 3600).toFixed(1) : ""
      ].join(","));
    }

    // Risorse (VM/LXC)
    for (const r of (c.resources || [])) {
      rows.push([
        esc(c.name),
        r.type,
        esc(r.name),
        r.vmid,
        esc(r.node),
        r.status,
        r.cpu != null ? (r.cpu * 100).toFixed(1) : "",
        r.maxcpu || "",
        r.mem ? (r.mem / 1073741824).toFixed(2) : "",
        r.maxmem ? (r.maxmem / 1073741824).toFixed(2) : "",
        r.netin || 0,
        r.netout || 0,
        r.uptime ? (r.uptime / 3600).toFixed(1) : ""
      ].join(","));
    }
  }

  const csv = rows.join("\n");
  triggerDownload(csv, `atlas-inventory-${getDateStamp()}.csv`, "text/csv");
}

function esc(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
