/**
 * CollapsibleSection — Animated expand/collapse wrapper.
 *
 * Uses CSS grid trick (grid-template-rows: 0fr → 1fr) for smooth
 * height animation without measuring DOM or max-height hacks.
 *
 * Shows a clickable header with chevron, title, and optional summary
 * counts visible even when collapsed.
 */

import React, { useCallback } from "react";
import "./CollapsibleSection.css";

/**
 * Read/write collapsed state to localStorage.
 * @param {string} key - Unique key for the section
 * @param {boolean} defaultCollapsed - Default state if not persisted
 */
export function useCollapsedState(key, defaultCollapsed = false) {
  const storageKey = `atlas-collapsed-${key}`;
  const [collapsed, setCollapsedRaw] = React.useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) return stored === "true";
    } catch {}
    return defaultCollapsed;
  });

  const setCollapsed = useCallback((val) => {
    const next = typeof val === "function" ? val(collapsed) : val;
    setCollapsedRaw(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  }, [collapsed, storageKey]);

  const toggle = useCallback(() => setCollapsed(c => !c), [setCollapsed]);

  return [collapsed, toggle, setCollapsed];
}

/**
 * @param {boolean}   collapsed  - Whether the section is collapsed
 * @param {function}  onToggle   - Toggle callback
 * @param {string}    title      - Section title
 * @param {ReactNode} [summary]  - Summary shown even when collapsed (e.g. counts)
 * @param {string}    [className] - Extra class on the wrapper
 * @param {ReactNode} children   - Section content
 * @param {string}    [variant="section"] - "cluster" for cluster-level, "section" for sub-section
 */
export function CollapsibleSection({
  collapsed,
  onToggle,
  title,
  summary,
  className = "",
  children,
  variant = "section",
}) {
  return (
    <div className={`cs-wrapper cs-${variant} ${collapsed ? "cs-collapsed" : "cs-expanded"} ${className}`}>
      <button
        className="cs-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="cs-chevron">{collapsed ? "▸" : "▾"}</span>
        <span className="cs-title">{title}</span>
        {summary && <span className="cs-summary">{summary}</span>}
      </button>
      <div className="cs-content-grid">
        <div className="cs-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
