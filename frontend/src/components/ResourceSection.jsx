import React, { useMemo, useState } from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { CollapsibleSection, useCollapsedState } from "./CollapsibleSection";
import { ColumnPicker } from "./ColumnPicker";

const VIRTUAL_THRESHOLD = 100;

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
export function ResourceSection({ title, typeFilter, resources, clusterName, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine, onOpenResource, sectionKey }) {
  const [showAll, setShowAll] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsedState(sectionKey || `rs-${typeFilter}`, false);
  
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

  const term = searchQuery.toLowerCase();
  const filtered = useMemo(() => {
    return resources.filter(r => {
      if (r.type !== typeFilter) return false;
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
  }, [resources, typeFilter, term]);

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

  if (sortedResources.length === 0) {
    return null;
  }

  const running = sortedResources.filter(r => r.status === "running").length;
  const summary = `${running}/${sortedResources.length} running`;

  const needsVirtualization = sortedResources.length > VIRTUAL_THRESHOLD && !showAll;
  const visible = needsVirtualization ? sortedResources.slice(0, VIRTUAL_THRESHOLD) : sortedResources;

  return (
    <CollapsibleSection
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      title={`${title}${filtered.length > VIRTUAL_THRESHOLD ? ` (${filtered.length} total)` : ""}`}
      summary={summary}
      variant="section"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <ColumnPicker
          columns={RESOURCE_COLUMNS}
          visibleColumns={visibleColumns}
          onChange={handleColumnsChange}
          presets={RESOURCE_PRESETS}
        />
      </div>
      <div className="table-wrapper">
        <div className="responsive-table">
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
              {visible.map((r, idx) => {
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
                            {r.tags && r.tags.split(',').map(t => t.trim()).filter(t => t).map(tag => (
                              <span key={tag} className="resource-tag generic-tag">tag: {tag}</span>
                            ))}
                            {r.ips && r.ips.map(ip => (
                              <span key={ip} className="resource-tag ip-tag">{ip}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {needsVirtualization && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <button className="btn" onClick={() => setShowAll(true)}>
            Show all {filtered.length} items ({filtered.length - VIRTUAL_THRESHOLD} hidden)
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}
