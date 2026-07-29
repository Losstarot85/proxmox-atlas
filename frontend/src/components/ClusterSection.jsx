import React, { useMemo, useState } from "react";
import { AlertTriangle, Circle } from 'lucide-react';
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { UptimePulse } from "./UptimePulse";
import { ClusterHealthBar, classifyNode, classifyResource } from "./ClusterHealthBar";
import { CollapsibleSection, useCollapsedState } from "./CollapsibleSection";
import { ColumnPicker } from "./ColumnPicker";

const NODE_COLUMNS = [
  { id: "node", label: "Node", width: "15%" },
  { id: "status", label: "Status", width: "6%" },
  { id: "cpu", label: "CPU Usage", width: "15%" },
  { id: "ram", label: "RAM Usage", width: "15%" },
  { id: "net", label: "Network", width: "15%" },
  { id: "storage", label: "Storage", width: "15%" },
  { id: "load", label: "Load", width: "5%" },
  { id: "iowait", label: "IO Wait", width: "5%" },
  { id: "pressure_cpu", label: "CPU Stall", width: "5%", isPressure: true },
  { id: "pressure_ram", label: "RAM Stall", width: "5%", isPressure: true },
  { id: "pressure_io", label: "IO Stall", width: "5%", isPressure: true }
];

const NODE_PRESETS = {
  Minimal: ["node", "status", "cpu", "ram"],
  Full: ["node", "status", "cpu", "ram", "net", "storage", "load", "iowait", "pressure_cpu", "pressure_ram", "pressure_io"],
  "Network Focus": ["node", "status", "cpu", "ram", "net"]
};

const getInitialNodeColumns = () => {
  try {
    const saved = localStorage.getItem("atlas-columns-nodes");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Error reading nodes columns from localStorage", e);
  }
  const isLargeScreen = window.innerWidth >= 1400;
  return NODE_COLUMNS.reduce((acc, col) => {
    acc[col.id] = col.isPressure ? isLargeScreen : true;
    return acc;
  }, {});
};

export function ClusterSection({ cluster, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine, onOpenResource, userRole }) {
  const [healthFilter, setHealthFilter] = useState(null);
  const [clusterCollapsed, toggleCluster] = useCollapsedState(`cluster-${cluster.name}`, false);
  const [nodesCollapsed, toggleNodes] = useCollapsedState(`nodes-${cluster.name}`, false);
  const [expandedNodes, setExpandedNodes] = useState({});

  const toggleNodeExpanded = (nodeName) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeName]: !prev[nodeName]
    }));
  };
  
  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState(getInitialNodeColumns);

  // Save to localStorage when columns visibility changes
  const handleColumnsChange = (updated) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem("atlas-columns-nodes", JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving nodes columns to localStorage", e);
    }
  };

  const activeColsCount = useMemo(() => {
    return Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  // Sorting State
  const [sortKey, setSortKey] = useState("node");
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
  
  const visibleNodes = useMemo(() => (cluster.nodes || []).filter(n => {
    if (!term) return true;
    const cpuStr = n.maxcpu ? `${n.maxcpu}c` : "";
    const ramStr = n.maxmem ? formatBytesToGB(n.maxmem).toLowerCase() : "";
    const storageMatches = n.storage_pools?.some(sp => sp.storage.toLowerCase().includes(term)) || false;

    return (n.name || "").toLowerCase().includes(term) ||
           (n.status || "").toLowerCase().includes(term) ||
           cpuStr.includes(term) ||
           ramStr.includes(term) ||
           storageMatches ||
           (n.ips || []).some(ip => ip.includes(term));
  }), [cluster.nodes, term]);

  const visibleResources = useMemo(() => (cluster.resources || []).filter(r => {
    if (!term) return true;
    const cpuStr = r.maxcpu ? `${r.maxcpu}c` : "";
    const ramStr = r.maxmem ? formatBytesToGB(r.maxmem).toLowerCase() : "";

    return (r.name || "").toLowerCase().includes(term) ||
           String(r.vmid).includes(term) ||
           (r.status || "").toLowerCase().includes(term) ||
           (r.pool || "").toLowerCase().includes(term) ||
           (r.tags || "").toLowerCase().includes(term) ||
           cpuStr.includes(term) ||
           ramStr.includes(term) ||
           (r.ips || []).some(ip => ip.includes(term));
  }), [cluster.resources, term]);

  // Apply health filter on top of search
  const filteredNodes = useMemo(() => {
    if (!healthFilter) return visibleNodes;
    return visibleNodes.filter(n => classifyNode(n) === healthFilter);
  }, [visibleNodes, healthFilter]);

  const sortedNodes = useMemo(() => {
    const list = [...filteredNodes];
    list.sort((a, b) => {
      let valA, valB;
      if (sortKey === "node") {
        valA = a.name || "";
        valB = b.name || "";
      } else if (sortKey === "status") {
        valA = a.status || "";
        valB = b.status || "";
      } else if (sortKey === "cpu") {
        valA = a.status === "online" && a.maxcpu > 0 ? (a.cpu || 0) : -1;
        valB = b.status === "online" && b.maxcpu > 0 ? (b.cpu || 0) : -1;
      } else if (sortKey === "ram") {
        valA = a.status === "online" && a.maxmem > 0 ? (a.mem || 0) / a.maxmem : -1;
        valB = b.status === "online" && b.maxmem > 0 ? (b.mem || 0) / b.maxmem : -1;
      } else if (sortKey === "net") {
        valA = a.status === "online" ? (a.netin || 0) + (a.netout || 0) : -1;
        valB = b.status === "online" ? (b.netin || 0) + (b.netout || 0) : -1;
      } else if (sortKey === "storage") {
        const maxSpA = a.storage_pools?.reduce((max, sp) => Math.max(max, sp.total > 0 ? sp.used / sp.total : 0), 0) || 0;
        const maxSpB = b.storage_pools?.reduce((max, sp) => Math.max(max, sp.total > 0 ? sp.used / sp.total : 0), 0) || 0;
        valA = a.status === "online" ? maxSpA : -1;
        valB = b.status === "online" ? maxSpB : -1;
      } else if (sortKey === "load") {
        valA = a.status === "online" && a.loadavg && a.loadavg[0] !== undefined ? a.loadavg[0] : -1;
        valB = b.status === "online" && b.loadavg && b.loadavg[0] !== undefined ? b.loadavg[0] : -1;
      } else if (sortKey === "iowait") {
        valA = a.status === "online" && a.iowait !== undefined ? a.iowait : -1;
        valB = b.status === "online" && b.iowait !== undefined ? b.iowait : -1;
      } else if (sortKey.startsWith("pressure_")) {
        valA = a.status === "online" && a[sortKey] !== undefined ? a[sortKey] : -1;
        valB = b.status === "online" && b[sortKey] !== undefined ? b[sortKey] : -1;
      } else {
        valA = a.name || "";
        valB = b.name || "";
      }

      if (valA === valB) {
        return (a.name || "").localeCompare(b.name || "");
      }

      if (typeof valA === "string") {
        return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
    });
    return list;
  }, [filteredNodes, sortKey, sortDirection]);

  const filteredResources = useMemo(() => {
    if (!healthFilter) return visibleResources;
    return visibleResources.filter(r => classifyResource(r) === healthFilter);
  }, [visibleResources, healthFilter]);

  // Pre-compute VM/LXC counts per node in a single pass (O(R) instead of O(N×R))
  const countsByNode = useMemo(() => {
    const map = {};
    (cluster.resources || []).forEach(r => {
      const n = r.node;
      if (!map[n]) map[n] = { activeVMs: 0, totalVMs: 0, activeLXCs: 0, totalLXCs: 0 };
      if (r.type === "VM") {
        map[n].totalVMs++;
        if (r.status === "running") map[n].activeVMs++;
      } else if (r.type === "LXC") {
        map[n].totalLXCs++;
        if (r.status === "running") map[n].activeLXCs++;
      }
    });
    return map;
  }, [cluster.resources]);

  // Summary counts for cluster header
  const clusterSummary = useMemo(() => {
    const nodes = cluster.nodes || [];
    const resources = cluster.resources || [];
    const onlineNodes = nodes.filter(n => n.status === "online").length;
    const runningVMs = resources.filter(r => r.type === "VM" && r.status === "running").length;
    const totalVMs = resources.filter(r => r.type === "VM").length;
    const runningLXCs = resources.filter(r => r.type === "LXC" && r.status === "running").length;
    const totalLXCs = resources.filter(r => r.type === "LXC").length;
    return `${onlineNodes}/${nodes.length} nodes · ${runningVMs}/${totalVMs} VMs · ${runningLXCs}/${totalLXCs} LXCs`;
  }, [cluster.nodes, cluster.resources]);

  const nodesSummary = useMemo(() => {
    const online = filteredNodes.filter(n => n.status === "online").length;
    return `${online}/${filteredNodes.length} online`;
  }, [filteredNodes]);

  if (visibleNodes.length === 0 && visibleResources.length === 0) {
    return null;
  }

  return (
    <section className="cluster-section">
      <CollapsibleSection
        collapsed={clusterCollapsed}
        onToggle={toggleCluster}
        title={cluster.name}
        summary={clusterCollapsed ? clusterSummary : null}
        variant="cluster"
        className="cluster-accordion-root"
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0', marginBottom: '1rem' }}>
          <span className="last-update">
            Updated: {cluster.last_update || "—"}
          </span>
        </div>

        <ClusterHealthBar
            nodes={cluster.nodes}
            resources={cluster.resources}
            activeFilter={healthFilter}
            onFilterChange={setHealthFilter}
          />

          {cluster.error && (
            <div className="global-error" style={{ marginBottom: "1.5rem" }}>
              <span><AlertTriangle size={16} /></span>
              <span>{cluster.error}</span>
            </div>
          )}
          
          {cluster.failed_nodes?.length > 0 && (
            <div className="global-error" style={{ marginBottom: "1.5rem" }}>
              <span><AlertTriangle size={16} /></span>
              <span>Partial data — unreachable nodes: {cluster.failed_nodes.join(", ")}</span>
            </div>
          )}

          {filteredNodes.length > 0 && (
            <CollapsibleSection
              collapsed={nodesCollapsed}
              onToggle={toggleNodes}
              title="Physical Nodes"
              summary={nodesSummary}
              variant="section"
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <ColumnPicker
                  columns={NODE_COLUMNS}
                  visibleColumns={visibleColumns}
                  onChange={handleColumnsChange}
                  presets={NODE_PRESETS}
                />
              </div>
              <div className="table-wrapper">
                <div className="responsive-table">
                  <table style={{ tableLayout: "fixed", width: "100%" }}>
                    <thead>
                      <tr>
                        {NODE_COLUMNS.map(col => visibleColumns[col.id] && (
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
                      {sortedNodes.length === 0 ? (
                        <tr><td colSpan={activeColsCount} className="empty-state">No nodes found</td></tr>
                      ) : (
                        sortedNodes.map((n, i) => {
                          const isOnline = n.status === "online";
                          const cpuPercent = isOnline && n.maxcpu > 0 ? ((n.cpu || 0) * 100).toFixed(1) : 0;
                          const ramPercent = isOnline && n.maxmem > 0 ? ((n.mem || 0) / n.maxmem * 100).toFixed(1) : 0;

                          const cm = metricsMap[`NODE-${n.name}`] || { cpu: [], ram: [], status: [] };
                          const cpuHistory = cm.cpu;
                          const ramHistory = cm.ram;
                          const nodeHistoryBlocks = cm.status;

                          const nc = countsByNode[n.name] || { activeVMs: 0, totalVMs: 0, activeLXCs: 0, totalLXCs: 0 };
                          const { activeVMs, totalVMs, activeLXCs, totalLXCs } = nc;

                          return (
                            <React.Fragment key={n.name}>
                            <tr 
                              id={`row-NODE-${n.name}`} 
                              onClick={() => onOpenResource ? onOpenResource({ ...n, vmid: n.name, type: 'NODE', name: n.name }) : onOpenTimeMachine({ id: n.name, type: 'NODE', name: n.name })}
                              style={{ cursor: 'pointer', '--row-index': i }}
                              className="hoverable-row"
                            >
                              {visibleColumns.node && (
                                <td style={{ fontWeight: 500 }}>
                                  {n.name}
                                  <UptimePulse historyBlocks={nodeHistoryBlocks} />
                                </td>
                              )}
                              {visibleColumns.status && (
                                <td>
                                  {isOnline 
                                    ? <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Circle size={8} fill="var(--success)" color="var(--success)" /> Online</span> 
                                    : <span className="badge badge-offline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Circle size={8} fill="var(--danger)" color="var(--danger)" /> Offline</span>}
                                </td>
                              )}
                              {visibleColumns.cpu && (
                                <td>
                                  {isOnline ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <Sparkline data={cpuHistory} color="#3b82f6" />
                                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '45px' }}>{cpuPercent}%</span>
                                        <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{n.maxcpu}C</span>
                                      </div>
                                    </div>
                                  ) : "-"}
                                </td>
                              )}
                              {visibleColumns.ram && (
                                <td>
                                  {isOnline ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <Sparkline data={ramHistory} color="#8b5cf6" />
                                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '45px' }}>{ramPercent}%</span>
                                        <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(n.maxmem)}</span>
                                      </div>
                                    </div>
                                  ) : "-"}
                                </td>
                              )}
                              {visibleColumns.net && (
                                <td className="mono-cell">{isOnline ? `⬇ ${formatNetwork(n.netin)} / ⬆ ${formatNetwork(n.netout)}` : "-"}</td>
                              )}
                              {visibleColumns.storage && (
                                <td>
                                  {isOnline && n.storage_pools && n.storage_pools.length > 0 ? (
                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                       {[...n.storage_pools]
                                         .filter(sp => sp.active === 1)
                                         .sort((a, b) => a.storage.localeCompare(b.storage))
                                         .map(sp => {
                                         const poolPercent = sp.total > 0 ? ((sp.used / sp.total) * 100).toFixed(1) : 0;
                                         return (
                                           <div key={sp.storage} className="progress-bar-inline" style={{fontSize: '0.8rem'}}>
                                             <span style={{width: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={sp.storage}>{sp.storage}</span>
                                             <div className="progress-bar-container" style={{flex: 1, minWidth: '50px'}}>
                                               <div className="progress-bar-fill" style={{width: `${poolPercent}%`, background: poolPercent > 85 ? 'var(--danger)' : poolPercent > 70 ? 'var(--warning)' : 'var(--accent)'}}></div>
                                             </div>
                                             <span className="mono-cell">{poolPercent}%</span>
                                           </div>
                                         );
                                       })}
                                     </div>
                                   ) : "-"}
                                </td>
                              )}
                              {visibleColumns.load && (
                                <td className="mono-cell">{isOnline ? formatLoad(n.loadavg) : "-"}</td>
                              )}
                              {visibleColumns.iowait && (
                                <td className="mono-cell">{isOnline ? formatPressure(n.iowait) : "-"}</td>
                              )}
                              {visibleColumns.pressure_cpu && (
                                <td className="mono-cell" style={{ color: n.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_cpu) : "-"}</td>
                              )}
                              {visibleColumns.pressure_ram && (
                                <td className="mono-cell" style={{ color: n.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_ram) : "-"}</td>
                              )}
                              {visibleColumns.pressure_io && (
                                <td className="mono-cell" style={{ color: n.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_io) : "-"}</td>
                              )}
                            </tr>
                            <tr style={{ backgroundColor: 'transparent' }}>
                              <td colSpan={activeColsCount} style={{ paddingTop: '0.5rem', paddingBottom: '0.75rem', borderTop: '1px solid var(--border)' }}>
                                <div className="tags-container" style={{ margin: 0 }}>
                                  {totalVMs > 0 && <span className="resource-tag pool-tag">active/total VMs: {activeVMs}/{totalVMs}</span>}
                                  {totalLXCs > 0 && <span className="resource-tag pool-tag">active/total LXCs: {activeLXCs}/{totalLXCs}</span>}
                                  {n.ips && n.ips.map(ip => (
                                    <span key={ip} className="resource-tag ip-tag">{ip}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
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
                {sortedNodes.map((n) => {
                  const isOnline = n.status === "online";
                  const cpuPercent = isOnline && n.maxcpu > 0 ? parseFloat(((n.cpu || 0) * 100).toFixed(1)) : 0;
                  const ramPercent = isOnline && n.maxmem > 0 ? parseFloat(((n.mem || 0) / n.maxmem * 100).toFixed(1)) : 0;
                  const nc = countsByNode[n.name] || { activeVMs: 0, totalVMs: 0, activeLXCs: 0, totalLXCs: 0 };
                  const { activeVMs, totalVMs, activeLXCs, totalLXCs } = nc;

                  const isExpanded = !!expandedNodes[n.name];

                  return (
                    <div 
                      key={n.name}
                      className="responsive-card"
                      onClick={() => onOpenResource ? onOpenResource({ ...n, vmid: n.name, type: 'NODE', name: n.name }) : onOpenTimeMachine({ id: n.name, type: 'NODE', name: n.name })}
                    >
                      <div className="card-header-flex">
                        <div className="card-title-group">
                          <span className="card-name">{n.name}</span>
                        </div>
                        {isOnline ? (
                          <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Circle size={8} fill="var(--success)" color="var(--success)" /> Online</span>
                        ) : (
                          <span className="badge badge-offline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Circle size={8} fill="var(--danger)" color="var(--danger)" /> Offline</span>
                        )}
                      </div>

                      <div className="card-progress-group">
                        <div className="card-progress-item">
                          <div className="card-progress-label">
                            <span>CPU Usage</span>
                            <span>{isOnline ? `${cpuPercent}% of ${n.maxcpu}C` : "—"}</span>
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
                            <span>{isOnline ? `${ramPercent}% of ${formatBytesToGB(n.maxmem)}` : "—"}</span>
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
                          e.stopPropagation(); // prevent opening resource
                          toggleNodeExpanded(n.name);
                        }}
                      >
                        {isExpanded ? "▲ Collapse Details" : "▼ Expand Details"}
                      </button>

                      {isExpanded && (
                        <div className="card-details-expanded" onClick={(e) => e.stopPropagation()}>
                          <div className="card-detail-row">
                            <span className="card-detail-label">Network</span>
                            <span className="card-detail-value">{isOnline ? `⬇ ${formatNetwork(n.netin)} / ⬆ ${formatNetwork(n.netout)}` : "—"}</span>
                          </div>
                          
                          <div className="card-detail-row">
                            <span className="card-detail-label">Load Average</span>
                            <span className="card-detail-value">{isOnline ? formatLoad(n.loadavg) : "—"}</span>
                          </div>

                          <div className="card-detail-row">
                            <span className="card-detail-label">IO Wait</span>
                            <span className="card-detail-value">{isOnline ? formatPressure(n.iowait) : "—"}</span>
                          </div>

                          <div className="card-detail-row" style={{ flexDirection: 'column', gap: '0.25rem' }}>
                            <span className="card-detail-label" style={{ marginBottom: '0.25rem' }}>Storage Pools</span>
                            {isOnline && n.storage_pools && n.storage_pools.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                                {[...n.storage_pools]
                                  .filter(sp => sp.active === 1)
                                  .sort((a, b) => a.storage.localeCompare(b.storage))
                                  .map(sp => {
                                    const poolPercent = sp.total > 0 ? ((sp.used / sp.total) * 100).toFixed(1) : 0;
                                    return (
                                      <div key={sp.storage} className="progress-bar-inline" style={{ fontSize: '0.8rem', display: 'flex', width: '100%' }}>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.storage}</span>
                                        <div className="progress-bar-container" style={{ width: '100px', margin: '0 8px' }}>
                                          <div className="progress-bar-fill" style={{ width: `${poolPercent}%`, background: poolPercent > 85 ? 'var(--danger)' : poolPercent > 70 ? 'var(--warning)' : 'var(--accent)' }}></div>
                                        </div>
                                        <span className="mono-cell" style={{ width: '40px', textAlign: 'right' }}>{poolPercent}%</span>
                                      </div>
                                    );
                                  })}
                              </div>
                            ) : "—"}
                          </div>

                          <div className="card-detail-row">
                            <span className="card-detail-label">Pressure CPU Stall</span>
                            <span className="card-detail-value">{isOnline ? formatPressure(n.pressure_cpu) : "—"}</span>
                          </div>

                          <div className="card-detail-row">
                            <span className="card-detail-label">Pressure Memory Stall</span>
                            <span className="card-detail-value">{isOnline ? formatPressure(n.pressure_ram) : "—"}</span>
                          </div>

                          <div className="card-detail-row">
                            <span className="card-detail-label">Pressure IO Stall</span>
                            <span className="card-detail-value">{isOnline ? formatPressure(n.pressure_io) : "—"}</span>
                          </div>

                          <div className="card-detail-row" style={{ flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                            <span className="card-detail-label">Tags & IPs</span>
                            <div className="tags-container" style={{ margin: 0, flexWrap: 'wrap', gap: '4px' }}>
                              {totalVMs > 0 && <span className="resource-tag pool-tag">VMs: {activeVMs}/{totalVMs}</span>}
                              {totalLXCs > 0 && <span className="resource-tag pool-tag">LXCs: {activeLXCs}/{totalLXCs}</span>}
                              {n.ips && n.ips.map(ip => (
                                <span key={ip} className="resource-tag ip-tag">{ip}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          <ResourceSection title="Virtual Machines" typeFilter="VM" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} sectionKey={`vms-${cluster.name}`} userRole={userRole} />
          <ResourceSection title="LXC Containers" typeFilter="LXC" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} sectionKey={`lxcs-${cluster.name}`} userRole={userRole} />
        </CollapsibleSection>
    </section>
  );
}
