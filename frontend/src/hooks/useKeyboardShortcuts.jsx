/**
 * useKeyboardShortcuts — Global keyboard shortcuts for Proxmox Atlas.
 *
 * Shortcuts:
 *   1-4       Switch tabs (Dashboard, Topology, Alerts, Settings)
 *   Esc       Close any open modal
 *   /         Focus dashboard search
 *   ?         Show keyboard shortcuts cheat sheet
 *   T         Toggle dark/light theme
 *   E         Export JSON snapshot
 *   Ctrl+K    Open command palette (handled by useCommandPalette)
 *
 * All shortcuts are suppressed when focus is on an input/textarea/select.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { key: "1", label: "Dashboard", group: "Navigation", description: "Switch to Dashboard tab" },
  { key: "2", label: "Topology", group: "Navigation", description: "Switch to Topology tab" },
  { key: "3", label: "Alerts", group: "Navigation", description: "Switch to Alerts tab" },
  { key: "4", label: "Settings", group: "Navigation", description: "Switch to Settings tab" },
  { key: "/", label: "Search", group: "Navigation", description: "Focus dashboard search" },
  { key: "Ctrl+K", label: "Command Palette", group: "Navigation", description: "Open command palette" },
  { key: "Esc", label: "Close", group: "General", description: "Close any open modal or palette" },
  { key: "?", label: "Shortcuts", group: "General", description: "Show this shortcuts cheat sheet" },
  { key: "T", label: "Theme", group: "Actions", description: "Toggle dark / light theme" },
  { key: "E", label: "Export", group: "Actions", description: "Export JSON snapshot" },
];

export function useKeyboardShortcuts({
  onNavigate,
  onCloseModals,
  onFocusSearch,
  onToggleTheme,
  onExportJSON,
  isAuthenticated,
}) {
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const handleKeyDown = useCallback(
    (e) => {
      // Don't intercept when user is typing in an input
      const tag = e.target.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;

      // Esc always works
      if (e.key === "Escape") {
        if (showCheatSheet) {
          setShowCheatSheet(false);
          e.preventDefault();
          return;
        }
        onCloseModals?.();
        return;
      }

      // Skip remaining shortcuts if typing in input or not authenticated
      if (isInput || !isAuthenticated) return;

      // Avoid firing when Ctrl/Meta is held (except for our explicit combos)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "1":
          e.preventDefault();
          onNavigate?.("dashboard");
          break;
        case "2":
          e.preventDefault();
          onNavigate?.("topology");
          break;
        case "3":
          e.preventDefault();
          onNavigate?.("alerts");
          break;
        case "4":
          e.preventDefault();
          onNavigate?.("settings");
          break;
        case "/":
          e.preventDefault();
          onFocusSearch?.();
          break;
        case "?":
          e.preventDefault();
          setShowCheatSheet((prev) => !prev);
          break;
        case "t":
        case "T":
          e.preventDefault();
          onToggleTheme?.();
          break;
        case "e":
        case "E":
          e.preventDefault();
          onExportJSON?.();
          break;
        default:
          break;
      }
    },
    [isAuthenticated, showCheatSheet, onNavigate, onCloseModals, onFocusSearch, onToggleTheme, onExportJSON]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return {
    showCheatSheet,
    closeCheatSheet: () => setShowCheatSheet(false),
    shortcuts: SHORTCUTS,
  };
}

/**
 * ShortcutsCheatSheet — modal showing all available keyboard shortcuts.
 */
export function ShortcutsCheatSheet({ shortcuts, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    modalRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      }
      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
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

  // Group shortcuts by category
  const groups = {};
  shortcuts.forEach((s) => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div 
        ref={modalRef}
        tabIndex="-1"
        className="shortcuts-modal" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        style={{ outline: "none" }}
      >
        <div className="shortcuts-header">
          <h3 id="shortcuts-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Keyboard size={18} /> Keyboard Shortcuts</h3>
          <kbd className="palette-esc" onClick={onClose} role="button" aria-label="Close shortcuts list">ESC</kbd>
        </div>
        <div className="shortcuts-body">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="shortcuts-group">
              <h4 className="shortcuts-group-title">{group}</h4>
              {items.map((s) => (
                <div key={s.key} className="shortcuts-row">
                  <kbd className="shortcuts-key">{s.key}</kbd>
                  <span className="shortcuts-desc">{s.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="palette-footer">
          <span>Press <kbd>?</kbd> to toggle this sheet</span>
        </div>
      </div>
    </div>
  );
}
