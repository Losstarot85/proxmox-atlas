/**
 * ClusterHealthBar — Horizontal segmented bar showing cluster health at a glance.
 *
 * Segments: Healthy (green), Warning (yellow), Critical (red), Offline (gray)
 * Clickable segments act as filters — clicking toggles the filter for that health tier.
 * Shows counts: "12 healthy | 2 warning | 1 critical | 0 offline"
 */

import React, { useMemo } from "react";
import { Check, AlertTriangle, X, Circle } from 'lucide-react';
import "./ClusterHealthBar.css";

/**
 * Classify a node's health tier.
 */
function classifyNode(n) {
  if (n.status !== "online") return "offline";

  const cpuPct = n.maxcpu > 0 ? (n.cpu || 0) * 100 : 0;
  const ramPct = n.maxmem > 0 ? ((n.mem || 0) / n.maxmem) * 100 : 0;
  const pCpu = n.pressure_cpu || 0;
  const pRam = n.pressure_ram || 0;
  const pIo = n.pressure_io || 0;

  // Critical: extreme utilization or high pressure
  if (cpuPct >= 95 || ramPct >= 95 || pCpu > 25 || pRam > 25 || pIo > 25) return "critical";
  // Warning: elevated utilization or moderate pressure
  if (cpuPct >= 80 || ramPct >= 85 || pCpu > 10 || pRam > 10 || pIo > 10) return "warning";

  return "healthy";
}

/**
 * Classify a resource's health tier.
 */
function classifyResource(r) {
  if (r.status !== "running") return "offline";

  const cpuPct = r.maxcpu > 0 ? (r.cpu || 0) * 100 : 0;
  const ramPct = r.maxmem > 0 ? ((r.mem || 0) / r.maxmem) * 100 : 0;
  const pCpu = r.pressure_cpu || 0;
  const pIo = r.pressure_io || 0;

  if (cpuPct >= 95 || ramPct >= 95 || pCpu > 25 || pIo > 25) return "critical";
  if (cpuPct >= 80 || ramPct >= 85 || pCpu > 10 || pIo > 10) return "warning";

  return "healthy";
}

const TIERS = [
  { key: "healthy",  label: "Healthy",  color: "#22c55e", icon: <Check size={12} /> },
  { key: "warning",  label: "Warning",  color: "#f59e0b", icon: <AlertTriangle size={12} /> },
  { key: "critical", label: "Critical", color: "#ef4444", icon: <X size={12} /> },
  { key: "offline",  label: "Offline",  color: "#6b7280", icon: <Circle size={10} /> },
];

export const ClusterHealthBar = React.memo(function ClusterHealthBar({ nodes, resources, activeFilter, onFilterChange }) {
  // Classify all entities
  const counts = useMemo(() => {
    const c = { healthy: 0, warning: 0, critical: 0, offline: 0 };
    (nodes || []).forEach(n => { c[classifyNode(n)]++; });
    (resources || []).forEach(r => { c[classifyResource(r)]++; });
    return c;
  }, [nodes, resources]);

  const total = counts.healthy + counts.warning + counts.critical + counts.offline;
  if (total === 0) return null;

  return (
    <div className="chb-container">
      {/* Segmented bar */}
      <div className="chb-bar">
        {TIERS.map(tier => {
          const pct = total > 0 ? (counts[tier.key] / total) * 100 : 0;
          if (pct === 0) return null;
          const isActive = activeFilter === tier.key;
          return (
            <div
              key={tier.key}
              className={`chb-segment chb-${tier.key} ${isActive ? "chb-active" : ""}`}
              style={{ width: `${pct}%`, background: tier.color }}
              onClick={() => onFilterChange(isActive ? null : tier.key)}
              title={`${counts[tier.key]} ${tier.label}`}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="chb-labels">
        {TIERS.map(tier => {
          const isActive = activeFilter === tier.key;
          return (
            <button
              key={tier.key}
              className={`chb-label ${isActive ? "chb-label-active" : ""}`}
              style={{ "--tier-color": tier.color }}
              onClick={() => onFilterChange(isActive ? null : tier.key)}
            >
              <span className="chb-dot" style={{ background: tier.color }} />
              <span className="chb-count">{counts[tier.key]}</span>
              <span className="chb-tier-name">{tier.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});


// Export classifiers for use in filtering
export { classifyNode, classifyResource };
