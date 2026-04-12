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
    clusters: clusters
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
    "vCPU", "RAM Total (GB)", "Tag", "Pool", "IPs"
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
        n.maxcpu || "",
        n.maxmem ? (n.maxmem / 1073741824).toFixed(2) : "",
        "", // Tag
        "", // Pool
        esc((n.ips || []).join(" / ")) // IPs
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
        r.maxcpu || "",
        r.maxmem ? (r.maxmem / 1073741824).toFixed(2) : "",
        esc(r.tags || ""), // Tag
        esc(r.pool || ""), // Pool
        esc((r.ips || []).join(" / ")) // IPs
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
