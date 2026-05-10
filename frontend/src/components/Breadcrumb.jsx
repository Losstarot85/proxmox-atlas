/**
 * Breadcrumb — Contextual navigation breadcrumb for Proxmox Atlas.
 *
 * Shows the path: Atlas > Tab > [context] and updates when
 * Time Machine or What-If modals are open.
 */

import React from "react";

const TAB_LABELS = {
  dashboard: "Dashboard",
  topology: "Topology",
  alerts: "Alerts",
  settings: "Settings",
};

export function Breadcrumb({ activeTab, timeMachineTarget, whatIfTarget, onNavigate, onCloseModals }) {
  const crumbs = [];

  // Root
  crumbs.push({
    label: "Atlas",
    icon: "🏠",
    onClick: () => onNavigate("dashboard"),
  });

  // Active tab
  crumbs.push({
    label: TAB_LABELS[activeTab] || activeTab,
    onClick: () => {
      onCloseModals();
      onNavigate(activeTab);
    },
  });

  // Time Machine context
  if (timeMachineTarget) {
    const typeLabel = timeMachineTarget.type === "NODE" ? "Node" : timeMachineTarget.type;
    crumbs.push({
      label: `${typeLabel}: ${timeMachineTarget.name}`,
      icon: "⏱",
      active: true,
    });
  }

  // What-If context
  if (whatIfTarget) {
    crumbs.push({
      label: whatIfTarget.cluster,
      onClick: () => onCloseModals(),
    });
    crumbs.push({
      label: `What-If: ${whatIfTarget.node}`,
      icon: "⚡",
      active: true,
    });
  }

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((crumb, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="breadcrumb-sep">›</span>}
          {crumb.onClick && !crumb.active ? (
            <button className="breadcrumb-link" onClick={crumb.onClick}>
              {crumb.icon && <span className="breadcrumb-icon">{crumb.icon}</span>}
              {crumb.label}
            </button>
          ) : (
            <span className={`breadcrumb-current ${crumb.active ? "breadcrumb-active" : ""}`}>
              {crumb.icon && <span className="breadcrumb-icon">{crumb.icon}</span>}
              {crumb.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
