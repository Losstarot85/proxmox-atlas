/**
 * Skeleton Loading Components — Proxmox Atlas
 *
 * Shimmer-animated placeholders that mirror the real UI layout.
 * Reduces perceived latency by ~40% vs traditional spinners.
 *
 * Components:
 *   SkeletonDashboard  — Full-page dashboard placeholder (cards + table)
 *   SkeletonCards      — 4 summary card placeholders
 *   SkeletonTable      — 5-row table placeholder
 *   SkeletonChart      — Chart-shaped placeholder (Time Machine)
 *   SkeletonAlerts     — Alert list placeholder
 *   SkeletonSimulation — What-If simulation placeholder
 */

import React from "react";
import "./Skeletons.css";

/* ── Shimmer block primitive ── */
const Bone = ({ className = "", style }) => (
  <div className={`skeleton-pulse ${className}`} style={style} />
);

/* ══════════════════════════════════════════════════════════════════════
   SkeletonCards — 4 summary cards matching SummaryCards layout
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonCards() {
  return (
    <div className="skeleton-container skeleton-cards-grid">
      {/* Wide chart cards (CPU + RAM) */}
      <div className="skeleton-card skeleton-card--wide">
        <Bone className="skeleton-card-label" />
        <Bone className="skeleton-card-chart" />
      </div>
      <div className="skeleton-card skeleton-card--wide">
        <Bone className="skeleton-card-label" />
        <Bone className="skeleton-card-chart" />
      </div>
      {/* Stat cards (VMs + LXCs) */}
      <div className="skeleton-card">
        <Bone className="skeleton-card-label" />
        <Bone className="skeleton-card-value" />
        <Bone className="skeleton-card-sub" />
      </div>
      <div className="skeleton-card">
        <Bone className="skeleton-card-label" />
        <Bone className="skeleton-card-value" />
        <Bone className="skeleton-card-sub" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SkeletonTable — 5 rows of shimmer bars
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="skeleton-container skeleton-table">
      {/* Header */}
      <div className="skeleton-table-header">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="skeleton-table-header-cell" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-table-row">
          {Array.from({ length: 6 }, (_, j) => (
            <Bone key={j} className="skeleton-table-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SkeletonChart — Chart-shaped shimmer (for Time Machine)
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonChart({ count = 4 }) {
  return (
    <div className="skeleton-container skeleton-chart-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-chart-container">
          <Bone className="skeleton-chart-title" />
          <Bone className="skeleton-chart" />
          <div className="skeleton-chart-axis">
            {Array.from({ length: 5 }, (_, j) => (
              <Bone key={j} className="skeleton-chart-axis-tick" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SkeletonAlerts — Alert list placeholder
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonAlerts({ count = 4 }) {
  return (
    <div className="skeleton-container skeleton-alerts">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-alert-item">
          <Bone className="skeleton-alert-icon" />
          <div className="skeleton-alert-content">
            <Bone className="skeleton-alert-title" style={{ width: `${60 + Math.random() * 25}%` }} />
            <Bone className="skeleton-alert-desc" style={{ width: `${40 + Math.random() * 30}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SkeletonSimulation — What-If modal placeholder
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonSimulation() {
  return (
    <div className="skeleton-container skeleton-simulation">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton-sim-bar">
          <Bone className="skeleton-sim-label" />
          <Bone className="skeleton-sim-progress" />
          <Bone className="skeleton-sim-value" />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SkeletonDashboard — Full-page loading (replaces App.jsx spinners)
   Mirrors: header + SummaryCards + ClusterSection table
   ══════════════════════════════════════════════════════════════════════ */
export function SkeletonDashboard() {
  return (
    <div className="skeleton-container skeleton-dashboard">
      {/* Header bar */}
      <div className="skeleton-header">
        <Bone className="skeleton-header-title" />
        <div className="skeleton-header-actions">
          <Bone className="skeleton-header-btn" />
          <Bone className="skeleton-header-btn" />
        </div>
      </div>

      {/* Summary cards */}
      <SkeletonCards />

      {/* Cluster table */}
      <SkeletonTable rows={5} />
    </div>
  );
}
