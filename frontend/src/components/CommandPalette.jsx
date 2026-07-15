/**
 * Command Palette — Proxmox Atlas
 *
 * ⌘K / Ctrl+K to open. Fuzzy search across VMs, LXCs, Nodes, Clusters.
 * Keyboard navigation (↑↓ + Enter), recent items, and quick actions.
 *
 * CSS lives in App.css (palette-* classes).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useI18n } from "../i18n";

const RECENT_KEY = "atlas-palette-recent";
const MAX_RECENT = 5;

/**
 * Simple fuzzy match — checks if all query characters appear in order.
 * Returns a score (lower = better). -1 means no match.
 */
function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches and start-of-word
      const gap = ti - lastIdx;
      score += gap === 1 ? 0 : gap;
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === ".") {
        score -= 5; // Bonus for word boundary
      }
      lastIdx = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

/**
 * Load/save recent items from localStorage.
 */
function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(item) {
  const recent = loadRecent().filter((r) => r.id !== item.id);
  recent.unshift({ id: item.id, name: item.name, icon: item.icon, sub: item.sub });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

/**
 * Build searchable items from cluster data + static actions.
 */
function buildItems(clusters, activeTab) {
  const items = [];

  // Static navigation actions
  items.push(
    { id: "nav-dashboard", name: "Go to Dashboard", icon: "📊", sub: "Navigation", action: "navigate", tab: "dashboard" },
    { id: "nav-topology", name: "Go to Topology", icon: "🗺️", sub: "Navigation", action: "navigate", tab: "topology" },
    { id: "nav-alerts", name: "Go to Alerts", icon: "🔔", sub: "Navigation", action: "navigate", tab: "alerts" },
    { id: "nav-settings", name: "Go to Settings", icon: "⚙️", sub: "Navigation", action: "navigate", tab: "settings" },
    { id: "act-export-json", name: "Export JSON", icon: "📥", sub: "Export current data as JSON", action: "export-json" },
    { id: "act-export-csv", name: "Export CSV", icon: "📄", sub: "Export current data as CSV", action: "export-csv" },
    { id: "act-theme", name: "Toggle Theme", icon: "🌓", sub: "Switch between dark and light mode", action: "toggle-theme" }
  );

  // Dynamic items from cluster data
  clusters.forEach((cluster) => {
    items.push({
      id: `cluster-${cluster.name}`,
      name: cluster.name,
      icon: "🏢",
      sub: `Cluster · ${cluster.nodes?.length || 0} nodes`,
      action: "cluster",
      data: cluster,
    });

    cluster.nodes?.forEach((node) => {
      items.push({
        id: `node-${cluster.name}-${node.name}`,
        name: node.name,
        icon: node.status === "online" ? "🖥️" : "🔴",
        sub: `Node · ${cluster.name} · ${node.status}`,
        action: "time-machine",
        data: { id: node.name, type: "NODE", name: node.name },
      });
    });

    cluster.resources?.forEach((r) => {
      const icon = r.type === "VM" ? "💻" : "📦";
      const status = r.status === "running" ? "running" : "stopped";
      items.push({
        id: `${r.type}-${cluster.name}-${r.vmid}`,
        name: `${r.name} (${r.vmid})`,
        icon,
        sub: `${r.type} · ${cluster.name} · ${status}`,
        action: "time-machine",
        data: { id: r.vmid, type: r.type, name: r.name },
      });
    });
  });

  return items;
}

export function CommandPalette({ isOpen, onClose, clusters, onNavigate, onOpenTimeMachine, onExportJSON, onExportCSV, onToggleTheme }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build all searchable items
  const allItems = useMemo(() => buildItems(clusters || []), [clusters]);

  // Filter and rank items
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent items + navigation when no query
      const recent = loadRecent();
      const recentItems = recent
        .map((r) => allItems.find((item) => item.id === r.id))
        .filter(Boolean)
        .map((item) => ({ ...item, section: "Recent" }));

      const navItems = allItems
        .filter((item) => item.action === "navigate" || item.action === "export-json" || item.action === "export-csv" || item.action === "toggle-theme")
        .map((item) => ({ ...item, section: "Actions" }));

      return [...recentItems, ...navItems];
    }

    // Fuzzy search
    const scored = allItems
      .map((item) => {
        const nameScore = fuzzyMatch(query, item.name);
        const subScore = fuzzyMatch(query, item.sub || "");
        const bestScore = nameScore >= 0 ? nameScore : subScore >= 0 ? subScore + 10 : -1;
        return { ...item, score: bestScore };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 20);

    return scored;
  }, [query, allItems]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Execute action for selected item
  const executeItem = useCallback(
    (item) => {
      if (!item) return;
      saveRecent(item);
      onClose();

      switch (item.action) {
        case "navigate":
          onNavigate(item.tab);
          break;
        case "time-machine":
          onOpenTimeMachine(item.data);
          break;
        case "export-json":
          onExportJSON();
          break;
        case "export-csv":
          onExportCSV();
          break;
        case "toggle-theme":
          onToggleTheme();
          break;
        case "cluster":
          onNavigate("dashboard");
          break;
        default:
          break;
      }
    },
    [onClose, onNavigate, onOpenTimeMachine, onExportJSON, onExportCSV, onToggleTheme]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) executeItem(results[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [results, selectedIndex, executeItem, onClose]
  );

  if (!isOpen) return null;

  // Group results by section (if sections exist)
  const hasSection = results.some((r) => r.section);

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div 
        className="palette-modal" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search header */}
        <div className="palette-header">
          <span className="palette-icon">🔍</span>
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck="false"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="palette-listbox"
            aria-activedescendant={results[selectedIndex] ? results[selectedIndex].id : undefined}
            aria-label="Search actions, nodes, and virtual machines"
          />
          <button 
            className="palette-esc" 
            onClick={onClose}
            aria-label="Close command palette"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            <kbd>ESC</kbd>
          </button>
        </div>

        {/* Results */}
        <div 
          id="palette-listbox"
          className="palette-results" 
          ref={listRef}
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 ? (
            <div className="palette-empty">
              {t('palette.no_results')}
            </div>
          ) : (
            results.map((item, idx) => {
              // Section header
              const showSection =
                hasSection && item.section && (idx === 0 || results[idx - 1]?.section !== item.section);

              return (
                <div key={item.id} role="presentation">
                  {showSection && (
                    <div className="palette-section-label" role="presentation">{item.section}</div>
                  )}
                  <div
                    id={item.id}
                    className={`palette-item ${idx === selectedIndex ? "selected" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => executeItem(item)}
                    role="option"
                    aria-selected={idx === selectedIndex}
                  >
                    <span className="palette-item-icon">{item.icon}</span>
                    <div className="palette-item-details">
                      <span className="palette-item-name">{highlightMatch(item.name, query)}</span>
                      <span className="palette-item-sub">{item.sub}</span>
                    </div>
                    <span className="palette-item-action">
                      {item.action === "time-machine" ? "⏱ Time Machine" : 
                       item.action === "navigate" ? "↵ Open" :
                       item.action === "toggle-theme" ? "↵ Toggle" :
                       item.action === "export-json" || item.action === "export-csv" ? "↓ Export" :
                       "↵ Open"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Highlight matching characters in the result name.
 */
function highlightMatch(text, query) {
  if (!query) return text;
  const q = query.toLowerCase();
  const result = [];
  let qi = 0;

  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && text[i].toLowerCase() === q[qi]) {
      result.push(
        <mark key={i} style={{ 
          color: "var(--accent-light)", 
          background: "transparent", 
          fontWeight: 600 
        }}>
          {text[i]}
        </mark>
      );
      qi++;
    } else {
      result.push(text[i]);
    }
  }

  return result;
}

/**
 * useCommandPalette — hook for global ⌘K / Ctrl+K shortcut.
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}
