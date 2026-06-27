/**
 * ResourceDetail — Slide-in drawer showing full resource details.
 *
 * Shows: header with status, live metrics gauges, sparkline history,
 * configuration, network info, and action buttons placeholder.
 */

import React, { useState } from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { RadialGauge } from "./RadialGauge";
import { API_BASE } from "../config";
import { useToast } from "./Toast";
import "./ResourceDetail.css";



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

export function ResourceDetail({ resource, clusterName, metricsMap, onClose, onOpenTimeMachine, userRole }) {
  if (!resource) return null;

  const [confirmModal, setConfirmModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const toast = useToast();

  const isRunning = resource.status === "running";
  const cpuPct = isRunning && resource.maxcpu > 0 ? resource.cpu * 100 : 0;
  const ramPct = isRunning && resource.maxmem > 0 ? (resource.mem / resource.maxmem) * 100 : 0;
  const ramUsed = resource.mem || 0;
  const ramTotal = resource.maxmem || 0;

  // Metrics history
  const metricKey = `${clusterName}-${resource.type}-${resource.vmid}`;
  const cm = metricsMap?.[metricKey] || { cpu: [], ram: [] };

  const handleDetailAction = (action) => {
    let warning = "";
    if (action === "stop" || action === "shutdown") {
      warning = "Warning: Stopping or shutting down this resource may cause data corruption in active databases or interrupt running processes.";
    } else if (action === "reboot") {
      warning = "Warning: Rebooting this resource will temporarily disrupt all hosted services and active connections.";
    }

    setConfirmModal({
      action,
      warning
    });
  };

  const executeAction = async () => {
    if (!confirmModal) return;
    const { action } = confirmModal;
    setActionLoading(true);

    try {
      const res = await fetch(`${API_BASE}/actions/${encodeURIComponent(clusterName)}/${encodeURIComponent(resource.node)}/${encodeURIComponent(resource.type)}/${resource.vmid}/${action}`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Power action '${action}' initiated successfully on ${resource.name}`);
      } else {
        toast.error(`Action failed: ${data.detail || "Unknown error"}`);
      }
    } catch (err) {
      toast.error(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
      setConfirmModal(null);
    }
  };

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
            <button 
              className="btn btn-start" 
              disabled={isRunning || (userRole !== "admin" && userRole !== "editor") || actionLoading}
              onClick={() => handleDetailAction("start")}
              title={userRole !== "admin" && userRole !== "editor" ? "Insufficient permissions" : ""}
            >
              ▶️ Start
            </button>
            <button 
              className="btn btn-shutdown" 
              disabled={!isRunning || (userRole !== "admin" && userRole !== "editor") || actionLoading}
              onClick={() => handleDetailAction("shutdown")}
              title={userRole !== "admin" && userRole !== "editor" ? "Insufficient permissions" : ""}
            >
              🔌 Shutdown
            </button>
            <button 
              className="btn btn-reboot" 
              disabled={!isRunning || (userRole !== "admin" && userRole !== "editor") || actionLoading}
              onClick={() => handleDetailAction("reboot")}
              title={userRole !== "admin" && userRole !== "editor" ? "Insufficient permissions" : ""}
            >
              🔄 Reboot
            </button>
            <button 
              className="btn btn-stop destructive" 
              disabled={!isRunning || (userRole !== "admin" && userRole !== "editor") || actionLoading}
              onClick={() => handleDetailAction("stop")}
              title={userRole !== "admin" && userRole !== "editor" ? "Insufficient permissions" : ""}
            >
              ⏹ Force Stop
            </button>
            <button className="btn" disabled title="Coming in Phase 5">
              📦 Migrate
            </button>
          </section>
        </div>
      </div>

      {confirmModal && (
        <div className="action-confirm-overlay" onClick={() => !actionLoading && setConfirmModal(null)}>
          <div className="action-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="action-confirm-header">
              <h3>Confirm Power Action</h3>
            </div>
            <div className="action-confirm-body">
              <p>Are you sure you want to <strong>{confirmModal.action.toUpperCase()}</strong> the resource <strong>{resource.name}</strong> (ID {resource.vmid})?</p>
              {confirmModal.warning && (
                <div className="action-confirm-warning">
                  ⚠️ {confirmModal.warning}
                </div>
              )}
            </div>
            <div className="action-confirm-footer">
              <button 
                className="btn btn-cancel" 
                disabled={actionLoading} 
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button 
                className={`btn btn-confirm ${confirmModal.action === "start" ? "btn-start" : "btn-stop"}`}
                disabled={actionLoading}
                onClick={executeAction}
              >
                {actionLoading ? "Executing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
