import React from "react";
import { HelpCircle } from 'lucide-react';
import { useI18n } from "../i18n";

export function EmptyState({ type, actionLabel, onAction }) {
  const { t } = useI18n();

  // Programmatically generated animated SVGs for a modern, high-tech aesthetic
  const renderIllustration = () => {
    switch (type) {
      case "clusters":
        return (
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="empty-state-svg"
            aria-hidden="true"
          >
            {/* Grid network lines */}
            <path d="M40 80 H120" stroke="var(--border)" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M80 40 V120" stroke="var(--border)" strokeWidth="2" strokeDasharray="4 4" />
            
            {/* Node 1 (Center) */}
            <rect x="60" y="60" width="40" height="40" rx="10" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="80" cy="80" r="6" fill="var(--accent)" className="pulse-circle" />

            {/* Sub-nodes */}
            <circle cx="30" cy="80" r="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
            <circle cx="130" cy="80" r="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
            <circle cx="80" cy="30" r="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
            <circle cx="80" cy="130" r="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />

            {/* Glowing effect */}
            <circle cx="80" cy="80" r="30" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.3" className="glow-circle" />
          </svg>
        );
      case "alerts":
        return (
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="empty-state-svg"
            aria-hidden="true"
          >
            {/* Shield back */}
            <path
              d="M80 25 C100 25 125 35 125 35 V75 C125 105 100 125 80 135 C60 125 35 105 35 75 V35 C35 35 60 25 80 25 Z"
              fill="rgba(16, 185, 129, 0.05)"
              stroke="var(--accent-light, #10b981)"
              strokeWidth="2"
              className="shield-path"
            />
            {/* Dynamic success checkmark */}
            <path
              d="M58 80 L72 94 L102 64"
              stroke="var(--accent-light, #10b981)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="check-path"
            />
            {/* Rings around check */}
            <circle cx="80" cy="80" r="35" stroke="var(--accent-light, #10b981)" strokeWidth="1" strokeOpacity="0.2" className="success-pulse" />
          </svg>
        );
      case "backups":
        return (
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="empty-state-svg"
            aria-hidden="true"
          >
            {/* Safe Lock / Database cylinder */}
            <rect x="40" y="45" width="80" height="70" rx="12" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
            <line x1="40" y1="68" x2="120" y2="68" stroke="var(--border)" strokeWidth="2" />
            <line x1="40" y1="92" x2="120" y2="92" stroke="var(--border)" strokeWidth="2" />
            
            {/* Rotation dial */}
            <circle cx="80" cy="80" r="22" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="80" cy="80" r="8" fill="var(--accent)" className="dial-spinner" />
            <line x1="80" y1="58" x2="80" y2="66" stroke="var(--accent)" strokeWidth="2" />
            <line x1="80" y1="94" x2="80" y2="102" stroke="var(--accent)" strokeWidth="2" />
            <line x1="58" y1="80" x2="66" y2="80" stroke="var(--accent)" strokeWidth="2" />
            <line x1="94" y1="80" x2="102" y2="80" stroke="var(--accent)" strokeWidth="2" />

            {/* Glowing success dot */}
            <circle cx="106" cy="58" r="4" fill="#10b981" className="backup-pulse" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (type) {
      case "clusters":
        return t("empty.clusters.title", "No Clusters Monitored");
      case "alerts":
        return t("empty.alerts.title", "All Systems Operational");
      case "backups":
        return t("empty.backups.title", "Backups Healthy");
      default:
        return t("empty.default.title", "No Data Available");
    }
  };

  const getDescription = () => {
    switch (type) {
      case "clusters":
        return t(
          "empty.clusters.desc",
          "Get started by adding your first Proxmox VE cluster. Atlas will automatically start monitoring nodes, VMs, backups, and health metrics."
        );
      case "alerts":
        return t(
          "empty.alerts.desc",
          "Great job! There are currently no warnings, failures, or performance alerts recorded on any of your connected clusters."
        );
      case "backups":
        return t(
          "empty.backups.desc",
          "All active virtual machines and LXC containers are backed up within your configured safety threshold. No stale data detected."
        );
      default:
        return t("empty.default.desc", "No items matched your current filters or configuration.");
    }
  };

  return (
    <div className="empty-state-card glass-card">
      <div className="illustration-wrapper">
        {renderIllustration()}
      </div>
      <h3 className="empty-state-title">{getTitle()}</h3>
      <p className="empty-state-desc">{getDescription()}</p>
      {onAction && (
        <button
          type="button"
          className="btn btn-primary empty-state-btn"
          onClick={onAction}
          aria-label={actionLabel || getTitle()}
        >
          {actionLabel || t("empty.default.action", "Get Started")}
        </button>
      )}
    </div>
  );
}

export function Tooltip({ text }) {
  return (
    <div className="tooltip-container">
      <button
        type="button"
        className="tooltip-trigger"
        aria-label="More information"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        <HelpCircle size={14} />
      </button>
      <div className="tooltip-bubble" role="tooltip">
        {text}
      </div>
    </div>
  );
}

export function DiscoveryDot({ featureId, children }) {
  const [visible, setVisible] = React.useState(() => {
    return !localStorage.getItem(`atlas-dismissed-${featureId}`);
  });

  if (!visible) return children;

  const handleInteraction = () => {
    localStorage.setItem(`atlas-dismissed-${featureId}`, "true");
    setVisible(false);
  };

  return (
    <span className="discovery-dot-wrapper" onMouseEnter={handleInteraction} onClick={handleInteraction}>
      {children}
      <span className="discovery-dot" aria-label="New feature alert"></span>
    </span>
  );
}
