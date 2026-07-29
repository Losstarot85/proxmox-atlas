import React, { useMemo, useState, useEffect, useRef } from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { CollapsibleSection, useCollapsedState } from "./CollapsibleSection";
import { ColumnPicker } from "./ColumnPicker";
import { API_BASE } from "../config";
import { useToast } from "./Toast";
import { useVirtualScroll } from "../hooks/useVirtualScroll";


const VIRTUAL_THRESHOLD = 100;

export function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsla(${hue}, 70%, 50%, 0.15)`,
    text: `hsl(${hue}, 85%, 65%)`,
    border: `hsla(${hue}, 70%, 55%, 0.3)`
  };
}

const RESOURCE_COLUMNS = [
  { id: "id", label: "ID", width: "5%" },
  { id: "name", label: "Name", width: "8%" },
  { id: "status", label: "Status", width: "6%" },
  { id: "cpu", label: "CPU Usage", width: "10%" },
  { id: "ram", label: "RAM Usage", width: "10%" },
  { id: "net", label: "Network", width: "10%" },
  { id: "disk", label: "Disk IO", width: "10%" },
  { id: "pressure_cpu", label: "CPU Stall", width: "5%", isPressure: true },
  { id: "pressure_ram", label: "RAM Stall", width: "5%", isPressure: true },
  { id: "pressure_io", label: "IO Stall", width: "5%", isPressure: true }
];

const RESOURCE_PRESETS = {
  Minimal: ["id", "name", "status", "cpu", "ram"],
  Full: ["id", "name", "status", "cpu", "ram", "net", "disk", "pressure_cpu", "pressure_ram", "pressure_io"],
  "Network Focus": ["id", "name", "status", "cpu", "ram", "net"]
};

const getInitialResourceColumns = (typeFilter) => {
  const storageKey = `atlas-columns-${typeFilter.toLowerCase()}s`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error(`Error reading ${typeFilter} columns from localStorage`, e);
  }
  const isLargeScreen = window.innerWidth >= 1400;
  return RESOURCE_COLUMNS.reduce((acc, col) => {
    acc[col.id] = col.isPressure ? isLargeScreen : true;
    return acc;
  }, {});
};

// Sub-component for resources (VM, LXC) with metrics
const ResourceRow = React.memo(({
  r,
  idx,
  visibleColumns,
  metricsMap,
  clusterName,
  activeColsCount,
  onOpenResource,
  onOpenTimeMachine,
  handleRowContextMenu
}) => {
  const isRunning = r.status === "running";
  const cpuPercent = isRunning && r.maxcpu > 0 ? (r.cpu * 100).toFixed(1) : 0;
  const ramPercent = isRunning && r.maxmem > 0 ? (r.mem / r.maxmem * 100).toFixed(1) : 0;

  const cm = metricsMap[`${clusterName}-${r.type}-${r.vmid}`] || { cpu: [], ram: [] };
  const cpuHistory = cm.cpu;
  const ramHistory = cm.ram;

  return (
    <React.Fragment key={`${r.type}-${r.vmid}`}>
      <tr
        id={`row-${r.type}-${r.vmid}`}
        onClick={() => onOpenResource ? onOpenResource(r) : onOpenTimeMachine && onOpenTimeMachine({ id: r.vmid, type: r.type, name: r.name })}
        onContextMenu={(e) => handleRowContextMenu(e, r)}
        style={{ cursor: 'pointer', '--row-index': idx }}
        className="hoverable-row"
      >
        {visibleColumns.id && <td className="mono-cell">{r.vmid}</td>}
        {visibleColumns.name && <td style={{ fontWeight: 500 }}>{r.name}</td>}
        {visibleColumns.status && (
          <td>
            {isRunning
              ? <span className="badge badge-online">🟢 Running</span>
              : <span className="badge badge-offline">🔴 Stopped</span>
            }
          </td>
        )}
        {visibleColumns.cpu && (
          <td>
            {isRunning ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Sparkline data={cpuHistory} color="#3b82f6" />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontWeight: 600, minWidth: '45px' }}>{cpuPercent}%</span>
                  <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{r.maxcpu}C</span>
                </div>
              </div>
            ) : "-"}
          </td>
        )}
        {visibleColumns.ram && (
          <td>
            {isRunning ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Sparkline data={ramHistory} color="#8b5cf6" />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontWeight: 600, minWidth: '45px' }}>{ramPercent}%</span>
                  <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(r.maxmem)}</span>
                </div>
              </div>
            ) : "-"}
          </td>
        )}
        {visibleColumns.net && (
          <td className="mono-cell">{isRunning ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "-"}</td>
        )}
        {visibleColumns.disk && (
          <td className="mono-cell">{isRunning ? formatIO(r.diskread, r.diskwrite) : "-"}</td>
        )}
        {visibleColumns.pressure_cpu && (
          <td className="mono-cell" style={{ color: r.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_cpu) : "-"}</td>
        )}
        {visibleColumns.pressure_ram && (
          <td className="mono-cell" style={{ color: r.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_ram) : "-"}</td>
        )}
        {visibleColumns.pressure_io && (
          <td className="mono-cell" style={{ color: r.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_io) : "-"}</td>
        )}
      </tr>
      {(r.pool || r.node || r.tags || (r.ips && r.ips.length > 0)) && (
        <tr style={{ backgroundColor: 'transparent' }}>
          <td colSpan={activeColsCount} style={{ paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
            <div className="tags-container" style={{ margin: 0 }}>
              {r.node && <span className="resource-tag node-tag">node: {r.node}</span>}
              {r.pool && <span className="resource-tag pool-tag">pool: {r.pool}</span>}
              {r.tags && r.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => {
                const colors = getTagColor(tag);
                return (
                  <span 
                    key={tag} 
                    className="resource-tag"
                    style={{
                      backgroundColor: colors.bg,
                      color: colors.text,
                      borderColor: colors.border,
                      border: '1px solid'
                    }}
                  >
                    tag: {tag}
                  </span>
                );
              })}
              {r.ips && r.ips.map(ip => (
                <span key={ip} className="resource-tag ip-tag">{ip}</span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
});

export function ResourceSection({ title, typeFilter, resources, clusterName, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine, onOpenResource, sectionKey, userRole }) {
  const [showAll, setShowAll] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsedState(sectionKey || `rs-${typeFilter}`, false);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});

  const toggleCardExpanded = (vmid) => {
    setExpandedCards(prev => ({
      ...prev,
      [vmid]: !prev[vmid]
    }));
  };
  const toast = useToast();

  useEffect(() => {
    const handleWindowClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  const handleRowContextMenu = (e, resource) => {
    if (userRole !== "admin" && userRole !== "editor") return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      resource
    });
  };

  const handleContextMenuAction = (action) => {
    if (!contextMenu) return;
    const { resource } = contextMenu;
    setContextMenu(null);

    let warning = "";
    if (action === "stop" || action === "shutdown") {
      warning = "Warning: Stopping or shutting down this resource may cause data corruption in active databases or interrupt running processes.";
    } else if (action === "reboot") {
      warning = "Warning: Rebooting this resource will temporarily disrupt all hosted services and active connections.";
    }

    setConfirmModal({
      resource,
      action,
      warning
    });
  };

  const executeAction = async () => {
    if (!confirmModal) return;
    const { resource, action } = confirmModal;
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
  
  // Columns Visibility State
  const [visibleColumns, setVisibleColumns] = useState(() => getInitialResourceColumns(typeFilter));

  const handleColumnsChange = (updated) => {
    setVisibleColumns(updated);
    const storageKey = `atlas-columns-${typeFilter.toLowerCase()}s`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error(`Error saving ${typeFilter} columns to localStorage`, e);
    }
  };

  const activeColsCount = useMemo(() => {
    return Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  // Sorting State
  const [sortKey, setSortKey] = useState("id");
  const [sortDirection, setSortDirection] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  // Grouping & Filtering State
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState([]);
  const [groupBy, setGroupBy] = useState("none");

  // Extract unique tags present in the current resource list
  const allUniqueTags = useMemo(() => {
    const tagsSet = new Set();
    resources.forEach(r => {
      if (r.type === typeFilter && r.tags) {
        r.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet).sort();
  }, [resources, typeFilter]);

  const term = searchQuery.toLowerCase();
  const filtered = useMemo(() => {
    return resources.filter(r => {
      if (r.type !== typeFilter) return false;

      // Status Filter
      if (statusFilter === "running" && r.status !== "running") return false;
      if (statusFilter === "stopped" && r.status === "running") return false;

      // Tag Filter
      if (selectedTags.length > 0) {
        const rTags = r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const hasMatchingTag = selectedTags.some(tag => rTags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      if (!term) return true;
      const cpuStr = r.maxcpu ? `${r.maxcpu}c` : "";
      const ramStr = r.maxmem ? formatBytesToGB(r.maxmem).toLowerCase() : "";

      return (
        (r.name || "").toLowerCase().includes(term) ||
        String(r.vmid).includes(term) ||
        (r.status || "").toLowerCase().includes(term) ||
        (r.node || "").toLowerCase().includes(term) ||
        (r.pool || "").toLowerCase().includes(term) ||
        (r.tags || "").toLowerCase().includes(term) ||
        cpuStr.includes(term) ||
        ramStr.includes(term) ||
        (r.ips || []).some(ip => ip.includes(term))
      );
    });
  }, [resources, typeFilter, term, statusFilter, selectedTags]);

  const sortedResources = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let valA, valB;
      if (sortKey === "id") {
        valA = a.vmid;
        valB = b.vmid;
      } else if (sortKey === "name") {
        valA = a.name || "";
        valB = b.name || "";
      } else if (sortKey === "status") {
        valA = a.status || "";
        valB = b.status || "";
      } else if (sortKey === "cpu") {
        valA = a.status === "running" && a.maxcpu > 0 ? (a.cpu || 0) : -1;
        valB = b.status === "running" && b.maxcpu > 0 ? (b.cpu || 0) : -1;
      } else if (sortKey === "ram") {
        valA = a.status === "running" && a.maxmem > 0 ? (a.mem || 0) / a.maxmem : -1;
        valB = b.status === "running" && b.maxmem > 0 ? (b.mem || 0) / b.maxmem : -1;
      } else if (sortKey === "net") {
        valA = a.status === "running" ? (a.netin || 0) + (a.netout || 0) : -1;
        valB = b.status === "running" ? (b.netin || 0) + (b.netout || 0) : -1;
      } else if (sortKey === "disk") {
        valA = a.status === "running" ? (a.diskread || 0) + (a.diskwrite || 0) : -1;
        valB = b.status === "running" ? (b.diskread || 0) + (b.diskwrite || 0) : -1;
      } else if (sortKey.startsWith("pressure_")) {
        valA = a.status === "running" && a[sortKey] !== undefined ? a[sortKey] : -1;
        valB = b.status === "running" && b[sortKey] !== undefined ? b[sortKey] : -1;
      } else {
        valA = a.vmid;
        valB = b.vmid;
      }

      if (valA === valB) {
        return a.vmid - b.vmid;
      }

      if (typeof valA === "string") {
        return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  const groupedResources = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = {};
    sortedResources.forEach(r => {
      let keys = [];
      if (groupBy === "node") {
        keys = [r.node || "No Node"];
      } else if (groupBy === "pool") {
        keys = [r.pool || "No Pool"];
      } else if (groupBy === "status") {
        keys = [r.status === "running" ? "Running" : "Stopped"];
      } else if (groupBy === "tag") {
        const tags = r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        keys = tags.length > 0 ? tags : ["No Tag"];
      }

      keys.forEach(key => {
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
    });

    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [sortedResources, groupBy]);

  if (sortedResources.length === 0 && term === "" && statusFilter === "all" && selectedTags.length === 0) {
    return null;
  }

  const running = sortedResources.filter(r => r.status === "running").length;
  const summary = `${running}/${sortedResources.length} running`;

  const containerRef = useRef(null);
  const isVirtual = sortedResources.length > 100 && groupBy === "none";
  const { virtualItems, offsetY, totalHeight } = useVirtualScroll({
    itemCount: sortedResources.length,
    itemHeight: 56,
    containerRef: isVirtual ? containerRef : null,
  });

  const renderRow = (r, idx) => (
    <ResourceRow
      key={`${r.type}-${r.vmid}`}
      r={r}
      idx={idx}
      visibleColumns={visibleColumns}
      metricsMap={metricsMap}
      clusterName={clusterName}
      activeColsCount={activeColsCount}
      onOpenResource={onOpenResource}
      onOpenTimeMachine={onOpenTimeMachine}
      handleRowContextMenu={handleRowContextMenu}
    />
  );


  const renderCard = (r) => {
    const isOnline = r.status === "running";
    const cpuPercent = isOnline && r.maxcpu > 0 ? parseFloat(((r.cpu || 0) * 100).toFixed(1)) : 0;
    const ramPercent = isOnline && r.maxmem > 0 ? parseFloat(((r.mem || 0) / r.maxmem * 100).toFixed(1)) : 0;
    const isExpanded = !!expandedCards[r.vmid];

    const tagsList = r.tags ? r.tags.split(/[,;\s]+/).filter(Boolean) : [];

    return (
      <div 
        key={r.vmid}
        className="responsive-card"
        onClick={() => onOpenResource ? onOpenResource({ ...r, cluster: clusterName }) : onOpenTimeMachine({ id: r.vmid, type: r.type, name: r.name })}
        style={{ cursor: 'pointer' }}
      >
        <div className="card-header-flex">
          <div className="card-title-group">
            <span className="card-name">{r.name}</span>
            <span className="card-vmid">({r.vmid})</span>
            <span className="resource-type-pill" style={{
              fontSize: '0.65rem',
              backgroundColor: r.type === "VM" ? 'var(--accent-glow)' : 'rgba(16, 185, 129, 0.15)',
              color: r.type === "VM" ? 'var(--accent-light)' : 'rgb(52, 211, 153)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              {r.type}
            </span>
          </div>
          {isOnline ? (
            <span className="badge badge-online">🟢 Running</span>
          ) : (
            <span className="badge badge-offline">🔴 Stopped</span>
          )}
        </div>

        <div className="card-progress-group">
          <div className="card-progress-item">
            <div className="card-progress-label">
              <span>CPU Usage</span>
              <span>{isOnline ? `${cpuPercent}% of ${r.maxcpu}C` : "—"}</span>
            </div>
            <div className="card-progress-bar-bg">
              <div 
                className="card-progress-bar-fill" 
                style={{ 
                  width: `${cpuPercent}%`, 
                  backgroundColor: cpuPercent > 85 ? 'var(--danger)' : cpuPercent > 70 ? 'var(--warning)' : 'var(--success)' 
                }}
              />
            </div>
          </div>

          <div className="card-progress-item">
            <div className="card-progress-label">
              <span>RAM Usage</span>
              <span>{isOnline ? `${ramPercent}% of ${formatBytesToGB(r.maxmem)}` : "—"}</span>
            </div>
            <div className="card-progress-bar-bg">
              <div 
                className="card-progress-bar-fill" 
                style={{ 
                  width: `${ramPercent}%`, 
                  backgroundColor: ramPercent > 90 ? 'var(--danger)' : ramPercent > 75 ? 'var(--warning)' : '#8b5cf6' 
                }}
              />
            </div>
          </div>
        </div>

        <button
          className="card-expand-btn"
          onClick={(e) => {
            e.stopPropagation(); // prevent opening resource modal
            toggleCardExpanded(r.vmid);
          }}
        >
          {isExpanded ? "▲ Collapse Details" : "▼ Expand Details"}
        </button>

        {isExpanded && (
          <div className="card-details-expanded" onClick={(e) => e.stopPropagation()}>
            <div className="card-detail-row">
              <span className="card-detail-label">Network</span>
              <span className="card-detail-value">{isOnline ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "—"}</span>
            </div>
            
            <div className="card-detail-row">
              <span className="card-detail-label">Disk IO</span>
              <span className="card-detail-value">{isOnline ? `⬇ ${formatIO(r.diskread)} / ⬆ ${formatIO(r.diskwrite)}` : "—"}</span>
            </div>

            <div className="card-detail-row">
              <span className="card-detail-label">Node Location</span>
              <span className="card-detail-value">{r.node}</span>
            </div>

            <div className="card-detail-row">
              <span className="card-detail-label">Pool Name</span>
              <span className="card-detail-value">{r.pool || "—"}</span>
            </div>

            {r.pressure_cpu !== undefined && (
              <div className="card-detail-row">
                <span className="card-detail-label">Pressure CPU Stall</span>
                <span className="card-detail-value">{isOnline ? formatPressure(r.pressure_cpu) : "—"}</span>
              </div>
            )}

            {r.pressure_ram !== undefined && (
              <div className="card-detail-row">
                <span className="card-detail-label">Pressure Memory Stall</span>
                <span className="card-detail-value">{isOnline ? formatPressure(r.pressure_ram) : "—"}</span>
              </div>
            )}

            {r.pressure_io !== undefined && (
              <div className="card-detail-row">
                <span className="card-detail-label">Pressure IO Stall</span>
                <span className="card-detail-value">{isOnline ? formatPressure(r.pressure_io) : "—"}</span>
              </div>
            )}

            {tagsList.length > 0 && (
              <div className="card-detail-row" style={{ flexDirection: 'column', gap: '0.25rem' }}>
                <span className="card-detail-label">Tags</span>
                <div className="tags-container" style={{ margin: 0, flexWrap: 'wrap', gap: '4px' }}>
                  {tagsList.map(tag => {
                    const colors = getTagColor(tag);
                    return (
                      <span 
                        key={tag} 
                        className="resource-tag" 
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderColor: colors.border
                        }}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Power Actions inside Card for Manager/Admin Roles */}
            {(userRole === "admin" || userRole === "editor") && (
              <div className="card-actions-group">
                {isOnline ? (
                  <>
                    <button 
                      className="btn btn-sm card-action-btn"
                      onClick={() => setConfirmModal({ resource: r, action: "shutdown", warning: "Warning: Shutting down this resource may interrupt active connections." })}
                    >
                      🔌 Shutdown
                    </button>
                    <button 
                      className="btn btn-sm card-action-btn"
                      onClick={() => setConfirmModal({ resource: r, action: "reboot", warning: "Warning: Rebooting this resource will temporarily disrupt all hosted services." })}
                    >
                      🔄 Reboot
                    </button>
                    <button 
                      className="btn btn-sm card-action-btn btn-stop"
                      onClick={() => setConfirmModal({ resource: r, action: "stop", warning: "Warning: Force stopping this resource may cause data corruption in active database processes." })}
                    >
                      ⏹ Stop
                    </button>
                  </>
                ) : (
                  <button 
                    className="btn btn-sm card-action-btn btn-start"
                    onClick={() => setConfirmModal({ resource: r, action: "start" })}
                  >
                    ▶️ Start
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  

  return (
    <CollapsibleSection
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      title={`${title}${filtered.length > VIRTUAL_THRESHOLD && groupBy === "none" ? ` (${filtered.length} total)` : ""}`}
      summary={summary}
      variant="section"
    >
      <div className="table-controls-bar">
        <div className="filter-group">
          <button 
            type="button" 
            className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
          <button 
            type="button" 
            className={`filter-btn ${statusFilter === 'running' ? 'active' : ''}`}
            onClick={() => setStatusFilter('running')}
          >
            Running
          </button>
          <button 
            type="button" 
            className={`filter-btn ${statusFilter === 'stopped' ? 'active' : ''}`}
            onClick={() => setStatusFilter('stopped')}
          >
            Stopped
          </button>
        </div>

        <div className="group-group">
          <label htmlFor={`group-select-${typeFilter}`}>Group By:</label>
          <select 
            id={`group-select-${typeFilter}`}
            value={groupBy} 
            onChange={(e) => setGroupBy(e.target.value)}
            className="select-control"
          >
            <option value="none">None</option>
            <option value="node">Node</option>
            <option value="pool">Pool</option>
            <option value="tag">Tag</option>
            <option value="status">Status</option>
          </select>
        </div>

        <ColumnPicker
          columns={RESOURCE_COLUMNS}
          visibleColumns={visibleColumns}
          onChange={handleColumnsChange}
          presets={RESOURCE_PRESETS}
        />
      </div>

      {allUniqueTags.length > 0 && (
        <div className="tag-filters-row">
          <span className="tag-filter-label">Filter tags:</span>
          <div className="tag-pills-scroll">
            {allUniqueTags.map(tag => {
              const isSelected = selectedTags.includes(tag);
              const colors = getTagColor(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  className={`tag-filter-pill ${isSelected ? 'active' : ''}`}
                  style={{
                    backgroundColor: isSelected ? colors.bg : 'rgba(255,255,255,0.02)',
                    color: isSelected ? colors.text : 'var(--text-secondary)',
                    borderColor: isSelected ? colors.border : 'var(--border)',
                    border: '1px solid'
                  }}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedTags(prev => prev.filter(t => t !== tag));
                    } else {
                      setSelectedTags(prev => [...prev, tag]);
                    }
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="table-wrapper">
        <div 
          ref={containerRef}
          className="responsive-table"
          style={{
            maxHeight: isVirtual ? "600px" : "none",
            overflowY: isVirtual ? "auto" : "visible"
          }}
        >
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <thead>
              <tr>
                {RESOURCE_COLUMNS.map(col => visibleColumns[col.id] && (
                  <th 
                    key={col.id} 
                    style={{ width: col.width }}
                    onClick={() => handleSort(col.id)}
                    className="sortable-header"
                    title={`Sort by ${col.label}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{col.label}</span>
                      {sortKey === col.id && (
                        <span className="sort-icon">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedResources.length === 0 ? (
                <tr><td colSpan={activeColsCount} className="empty-state">No resources found</td></tr>
              ) : isVirtual ? (
                <>
                  {offsetY > 0 && <tr style={{ height: `${offsetY}px` }}><td colSpan={activeColsCount} /></tr>}
                  {virtualItems.map(({ index }) => renderRow(sortedResources[index], index))}
                  {totalHeight - offsetY - (virtualItems.length * 56) > 0 && (
                    <tr style={{ height: `${Math.max(0, totalHeight - offsetY - (virtualItems.length * 56))}px` }}><td colSpan={activeColsCount} /></tr>
                  )}
                </>
              ) : groupBy === "none" ? (
                sortedResources.map((r, idx) => renderRow(r, idx))
              ) : (
                Object.keys(groupedResources).map(groupKey => {
                  const groupItems = groupedResources[groupKey];
                  return (
                    <React.Fragment key={groupKey}>
                      <tr className="group-header-row">
                        <td colSpan={activeColsCount} className="group-header-td">
                          {groupBy === "node" && `📍 Node: ${groupKey}`}
                          {groupBy === "pool" && `📦 Pool: ${groupKey}`}
                          {groupBy === "status" && `⚡ Status: ${groupKey}`}
                          {groupBy === "tag" && `🏷️ Tag: ${groupKey}`}
                          {` (${groupItems.length})`}
                        </td>
                      </tr>
                      {groupItems.map((r, idx) => renderRow(r, idx))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Responsive Card Layout for Mobile (< 1024px) */}
      <div className="responsive-cards">
        {sortedResources.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>No resources found</div>
        ) : groupBy === "none" ? (
          sortedResources.map((r) => renderCard(r))
        ) : (
          Object.keys(groupedResources).map(groupKey => {
            const groupItems = groupedResources[groupKey];
            return (
              <React.Fragment key={groupKey}>
                <div className="group-header-row" style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', marginTop: '0.75rem' }}>
                  {groupBy === "node" && `📍 Node: ${groupKey}`}
                  {groupBy === "pool" && `📦 Pool: ${groupKey}`}
                  {groupBy === "status" && `⚡ Status: ${groupKey}`}
                  {groupBy === "tag" && `🏷️ Tag: ${groupKey}`}
                  {` (${groupItems.length})`}
                </div>
                {groupItems.map((r) => renderCard(r))}
              </React.Fragment>
            );
          })
        )}
      </div>

      {contextMenu && (
        <div 
          className="context-menu" 
          style={{ 
            position: 'fixed', 
            top: contextMenu.y, 
            left: contextMenu.x, 
            zIndex: 1000 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            ID {contextMenu.resource.vmid} ({contextMenu.resource.name})
          </div>
          {contextMenu.resource.status === "running" ? (
            <>
              <button onClick={() => handleContextMenuAction("shutdown")}>🔌 Shutdown</button>
              <button onClick={() => handleContextMenuAction("reboot")}>🔄 Reboot</button>
              <button onClick={() => handleContextMenuAction("stop")} className="destructive">⏹ Force Stop</button>
            </>
          ) : (
            <button onClick={() => handleContextMenuAction("start")}>▶️ Start</button>
          )}
        </div>
      )}

      {confirmModal && (
        <div className="action-confirm-overlay" onClick={() => !actionLoading && setConfirmModal(null)}>
          <div className="action-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="action-confirm-header">
              <h3>Confirm Power Action</h3>
            </div>
            <div className="action-confirm-body">
              <p>Are you sure you want to <strong>{confirmModal.action.toUpperCase()}</strong> the resource <strong>{confirmModal.resource.name}</strong> (ID {confirmModal.resource.vmid})?</p>
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
    </CollapsibleSection>
  );
}

