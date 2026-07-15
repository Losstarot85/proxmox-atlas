/**
 * NodeDetail — Slide-in drawer showing full node details.
 *
 * Shows: header with status, pressure gauges, sparkline history,
 * storage pools, VM/LXC inventory, hardware info, network traffic.
 * Reuses rd-* CSS classes from ResourceDetail.css.
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { UptimePulse } from "./UptimePulse";
import { RadialGauge } from "./RadialGauge";
import "./ResourceDetail.css";



function InfoRow({ label, value, mono = false }) {
  if (value == null || value === "" || value === undefined) return null;
  return (
    <div className="rd-info-row">
      <span className="rd-info-label">{label}</span>
      <span className={`rd-info-value ${mono ? "mono-cell" : ""}`}>{value}</span>
    </div>
  );
}

/**
 * Storage pool bar — horizontal capacity bar.
 */
function StoragePoolBar({ pool }) {
  const pct = pool.total > 0 ? ((pool.used / pool.total) * 100) : 0;
  const color = pct > 85 ? "var(--danger)" : pct > 70 ? "var(--warning)" : "var(--accent)";
  const usedGB = formatBytesToGB(pool.used);
  const totalGB = formatBytesToGB(pool.total);

  return (
    <div className="nd-storage-pool">
      <div className="nd-storage-header">
        <span className="nd-storage-name">{pool.storage}</span>
        <span className="mono-cell nd-storage-pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="progress-bar-container" style={{ height: "8px" }}>
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="nd-storage-detail mono-cell">
        {usedGB} / {totalGB} — {pool.type || "unknown"}
      </div>
    </div>
  );
}

export function NodeDetail({ node, clusterName, metricsMap, resources, onClose, onOpenTimeMachine, onOpenResource }) {
  if (!node) return null;

  const [guestFilter, setGuestFilter] = useState("");
  const isOnline = node.status === "online";
  const cpuPct = isOnline && node.maxcpu > 0 ? (node.cpu || 0) * 100 : 0;
  const ramPct = isOnline && node.maxmem > 0 ? ((node.mem || 0) / node.maxmem) * 100 : 0;

  // Metrics history
  const cm = metricsMap?.[`NODE-${node.name}`] || { cpu: [], ram: [], status: [] };

  // Filter guests (VMs + LXCs) belonging to this node
  const nodeGuests = useMemo(() => {
    return (resources || [])
      .filter(r => r.node === node.name)
      .sort((a, b) => a.vmid - b.vmid);
  }, [resources, node.name]);

  const filteredGuests = useMemo(() => {
    if (!guestFilter) return nodeGuests;
    const term = guestFilter.toLowerCase();
    return nodeGuests.filter(r =>
      (r.name || "").toLowerCase().includes(term) ||
      String(r.vmid).includes(term) ||
      r.type.toLowerCase().includes(term) ||
      (r.status || "").toLowerCase().includes(term)
    );
  }, [nodeGuests, guestFilter]);

  const activeStoragePools = (node.storage_pools || [])
    .filter(sp => sp.active === 1)
    .sort((a, b) => a.storage.localeCompare(b.storage));

  const runningVMs = nodeGuests.filter(r => r.type === "VM" && r.status === "running").length;
  const totalVMs = nodeGuests.filter(r => r.type === "VM").length;
  const runningLXCs = nodeGuests.filter(r => r.type === "LXC" && r.status === "running").length;
  const totalLXCs = nodeGuests.filter(r => r.type === "LXC").length;

  const drawerRef = useRef(null);

  useEffect(() => {
    drawerRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      }
      if (e.key === "Tab") {
        if (!drawerRef.current) return;
        const focusable = drawerRef.current.querySelectorAll(
          'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="rd-overlay" onClick={onClose} role="presentation">
      <div 
        ref={drawerRef}
        tabIndex="-1"
        className="rd-drawer" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nd-title"
        style={{ outline: "none" }}
      >
        {/* Header */}
        <div className="rd-header">
          <div className="rd-header-left">
            <span className="rd-type-badge">🖥️</span>
            <div>
              <h2 id="nd-title" className="rd-title">{node.name}</h2>
              <span className="rd-subtitle mono-cell">
                Node · {clusterName}
                <UptimePulse historyBlocks={cm.status} />
              </span>
            </div>
          </div>
          <div className="rd-header-right">
            <span className={`badge ${isOnline ? "badge-online" : "badge-offline"}`}>
              {isOnline ? "🟢 Online" : "🔴 Offline"}
            </span>
            <button className="rd-close" onClick={onClose} aria-label="Close details">✕</button>
          </div>
        </div>

        <div className="rd-body">
          {/* Pressure Gauges */}
          {isOnline && (
            <section className="rd-section">
              <h3 className="rd-section-title">Live Metrics</h3>
              <div className="rd-gauges">
                <RadialGauge value={cpuPct} max={100} label="CPU" color="#3b82f6" />
                <RadialGauge value={ramPct} max={100} label="RAM" color="#8b5cf6" />
                <RadialGauge
                  value={node.pressure_cpu || 0} max={100}
                  label="CPU Stall"
                  color={(node.pressure_cpu || 0) > 10 ? "#f59e0b" : "#22c55e"}
                />
                <RadialGauge
                  value={node.pressure_ram || 0} max={100}
                  label="RAM Stall"
                  color={(node.pressure_ram || 0) > 10 ? "#f59e0b" : "#22c55e"}
                />
                <RadialGauge
                  value={node.pressure_io || 0} max={100}
                  label="IO Stall"
                  color={(node.pressure_io || 0) > 10 ? "#f59e0b" : "#22c55e"}
                />
              </div>
            </section>
          )}

          {/* Sparkline History */}
          {isOnline && (cm.cpu.length > 0 || cm.ram.length > 0) && (
            <section className="rd-section">
              <h3 className="rd-section-title">History (Last {cm.cpu.length} ticks)</h3>
              <div className="rd-sparklines">
                {cm.cpu.length > 0 && (
                  <div className="rd-sparkline-card">
                    <span className="rd-sparkline-label">CPU</span>
                    <Sparkline data={cm.cpu} color="#3b82f6" width={200} height={40} />
                    <span className="rd-sparkline-value">{cpuPct.toFixed(1)}%</span>
                  </div>
                )}
                {cm.ram.length > 0 && (
                  <div className="rd-sparkline-card">
                    <span className="rd-sparkline-label">RAM</span>
                    <Sparkline data={cm.ram} color="#8b5cf6" width={200} height={40} />
                    <span className="rd-sparkline-value">{ramPct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Hardware & Configuration */}
          <section className="rd-section">
            <h3 className="rd-section-title">Hardware & Configuration</h3>
            <div className="rd-info-grid">
              <InfoRow label="Status" value={node.status} />
              <InfoRow label="CPU Cores" value={node.maxcpu ? `${node.maxcpu} cores` : null} mono />
              <InfoRow label="Total RAM" value={node.maxmem ? formatBytesToGB(node.maxmem) : null} mono />
              {isOnline && <InfoRow label="RAM Used" value={node.mem ? formatBytesToGB(node.mem) : null} mono />}
              {isOnline && <InfoRow label="Load Average" value={formatLoad(node.loadavg)} mono />}
              {isOnline && <InfoRow label="IO Wait" value={formatPressure(node.iowait)} mono />}
              <InfoRow label="VMs" value={`${runningVMs}/${totalVMs} running`} mono />
              <InfoRow label="LXCs" value={`${runningLXCs}/${totalLXCs} running`} mono />
            </div>
          </section>

          {/* Network Traffic */}
          {isOnline && (
            <section className="rd-section">
              <h3 className="rd-section-title">Network Traffic</h3>
              <div className="rd-info-grid">
                <InfoRow label="Network In" value={formatNetwork(node.netin)} mono />
                <InfoRow label="Network Out" value={formatNetwork(node.netout)} mono />
              </div>
              {node.ips?.length > 0 && (
                <div className="rd-ips">
                  <span className="rd-info-label">IP Addresses</span>
                  <div className="tags-container" style={{ marginTop: "0.5rem" }}>
                    {node.ips.map(ip => (
                      <span key={ip} className="resource-tag ip-tag">{ip}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Storage Pools */}
          {activeStoragePools.length > 0 && (
            <section className="rd-section">
              <h3 className="rd-section-title">Storage Pools ({activeStoragePools.length})</h3>
              <div className="nd-storage-list">
                {activeStoragePools.map(sp => (
                  <StoragePoolBar key={sp.storage} pool={sp} />
                ))}
              </div>
            </section>
          )}

          {/* VM/LXC Inventory */}
          <section className="rd-section">
            <h3 className="rd-section-title">
              Guest Inventory ({nodeGuests.length})
            </h3>
            {nodeGuests.length > 5 && (
              <input
                type="text"
                className="search-input nd-guest-search"
                placeholder="Filter guests..."
                aria-label="Filter guests on this node"
                value={guestFilter}
                onChange={(e) => setGuestFilter(e.target.value)}
              />
            )}
            {filteredGuests.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontStyle: "italic", padding: "0.5rem 0" }}>
                {nodeGuests.length === 0 ? "No guests on this node" : "No matches"}
              </div>
            ) : (
              <div className="nd-guest-list">
                {filteredGuests.map(r => (
                  <div
                    key={`${r.type}-${r.vmid}`}
                    className="nd-guest-row"
                    onClick={() => onOpenResource && onOpenResource(r)}
                  >
                    <span className="nd-guest-icon">{r.type === "VM" ? "💻" : "📦"}</span>
                    <span className="nd-guest-id mono-cell">{r.vmid}</span>
                    <span className="nd-guest-name">{r.name}</span>
                    <span className={`badge ${r.status === "running" ? "badge-online" : "badge-offline"}`} style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                      {r.status === "running" ? "Running" : "Stopped"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <section className="rd-section rd-actions">
            <button className="btn" onClick={() => onOpenTimeMachine({ id: node.name, type: "NODE", name: node.name })}>
              ⏱ Open Time Machine
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
