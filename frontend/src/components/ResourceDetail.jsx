/**
 * ResourceDetail — Slide-in drawer showing full resource details.
 *
 * Shows: header with status, live metrics gauges, sparkline history,
 * configuration, network info, and action buttons placeholder.
 */

import React from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import "./ResourceDetail.css";

/**
 * Radial gauge — SVG circle showing percentage.
 */
function RadialGauge({ value, max, label, color, unit = "%" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="rd-gauge">
      <svg viewBox="0 0 100 100" className="rd-gauge-svg">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
        />
        <text x="50" y="46" textAnchor="middle" className="rd-gauge-value" fill="var(--text-primary)">
          {pct.toFixed(1)}{unit}
        </text>
        <text x="50" y="62" textAnchor="middle" className="rd-gauge-label" fill="var(--text-secondary)">
          {label}
        </text>
      </svg>
    </div>
  );
}

/**
 * Info row — key/value pair.
 */
function InfoRow({ label, value, mono = false }) {
  if (value == null || value === "" || value === undefined) return null;
  return (
    <div className="rd-info-row">
      <span className="rd-info-label">{label}</span>
      <span className={`rd-info-value ${mono ? "mono-cell" : ""}`}>{value}</span>
    </div>
  );
}

export function ResourceDetail({ resource, clusterName, metricsMap, onClose, onOpenTimeMachine }) {
  if (!resource) return null;

  const isRunning = resource.status === "running";
  const cpuPct = isRunning && resource.maxcpu > 0 ? resource.cpu * 100 : 0;
  const ramPct = isRunning && resource.maxmem > 0 ? (resource.mem / resource.maxmem) * 100 : 0;
  const ramUsed = resource.mem || 0;
  const ramTotal = resource.maxmem || 0;

  // Metrics history
  const metricKey = `${clusterName}-${resource.type}-${resource.vmid}`;
  const cm = metricsMap?.[metricKey] || { cpu: [], ram: [] };

  return (
    <div className="rd-overlay" onClick={onClose}>
      <div className="rd-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rd-header">
          <div className="rd-header-left">
            <span className="rd-type-badge">{resource.type === "VM" ? "💻 VM" : "📦 LXC"}</span>
            <div>
              <h2 className="rd-title">{resource.name}</h2>
              <span className="rd-subtitle mono-cell">ID {resource.vmid} · {clusterName}</span>
            </div>
          </div>
          <div className="rd-header-right">
            <span className={`badge ${isRunning ? "badge-online" : "badge-offline"}`}>
              {isRunning ? "🟢 Running" : "🔴 Stopped"}
            </span>
            <button className="rd-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="rd-body">
          {/* Live Metrics Gauges */}
          {isRunning && (
            <section className="rd-section">
              <h3 className="rd-section-title">Live Metrics</h3>
              <div className="rd-gauges">
                <RadialGauge value={cpuPct} max={100} label="CPU" color="#3b82f6" />
                <RadialGauge value={ramPct} max={100} label="RAM" color="#8b5cf6" />
                <RadialGauge
                  value={resource.pressure_cpu || 0}
                  max={100}
                  label="CPU Stall"
                  color={resource.pressure_cpu > 10 ? "#f59e0b" : "#22c55e"}
                />
                <RadialGauge
                  value={resource.pressure_io || 0}
                  max={100}
                  label="IO Stall"
                  color={resource.pressure_io > 10 ? "#f59e0b" : "#22c55e"}
                />
              </div>
            </section>
          )}

          {/* Sparkline History */}
          {isRunning && (cm.cpu.length > 0 || cm.ram.length > 0) && (
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

          {/* Configuration */}
          <section className="rd-section">
            <h3 className="rd-section-title">Configuration</h3>
            <div className="rd-info-grid">
              <InfoRow label="Type" value={resource.type} />
              <InfoRow label="VMID" value={resource.vmid} mono />
              <InfoRow label="Node" value={resource.node} />
              <InfoRow label="vCPUs" value={resource.maxcpu ? `${resource.maxcpu} cores` : null} mono />
              <InfoRow label="RAM" value={ramTotal ? formatBytesToGB(ramTotal) : null} mono />
              {isRunning && <InfoRow label="RAM Used" value={ramUsed ? formatBytesToGB(ramUsed) : null} mono />}
              <InfoRow label="Pool" value={resource.pool} />
              <InfoRow label="Status" value={resource.status} />
            </div>
          </section>

          {/* Tags */}
          {resource.tags && (
            <section className="rd-section">
              <h3 className="rd-section-title">Tags</h3>
              <div className="tags-container">
                {resource.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="resource-tag generic-tag">tag: {tag}</span>
                ))}
              </div>
            </section>
          )}

          {/* Network */}
          {(resource.ips?.length > 0 || isRunning) && (
            <section className="rd-section">
              <h3 className="rd-section-title">Network</h3>
              <div className="rd-info-grid">
                {isRunning && <InfoRow label="Network In" value={formatNetwork(resource.netin)} mono />}
                {isRunning && <InfoRow label="Network Out" value={formatNetwork(resource.netout)} mono />}
                {isRunning && <InfoRow label="Disk IO" value={formatIO(resource.diskread, resource.diskwrite)} mono />}
              </div>
              {resource.ips?.length > 0 && (
                <div className="rd-ips">
                  <span className="rd-info-label">IP Addresses</span>
                  <div className="tags-container" style={{ marginTop: "0.5rem" }}>
                    {resource.ips.map(ip => (
                      <span key={ip} className="resource-tag ip-tag">{ip}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Actions */}
          <section className="rd-section rd-actions">
            <button className="btn" onClick={() => { onOpenTimeMachine({ id: resource.vmid, type: resource.type, name: resource.name }); }}>
              ⏱ Open Time Machine
            </button>
            <button className="btn" disabled title="Coming in Phase 5">
              ▶️ Start
            </button>
            <button className="btn" disabled title="Coming in Phase 5">
              ⏹ Stop
            </button>
            <button className="btn" disabled title="Coming in Phase 5">
              🔄 Restart
            </button>
            <button className="btn" disabled title="Coming in Phase 5">
              📦 Migrate
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
