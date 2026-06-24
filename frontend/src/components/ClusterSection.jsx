import React, { useMemo, useState } from "react";
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

export function ClusterSection({ cluster, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine, onOpenResource }) {
  const [healthFilter, setHealthFilter] = useState(null);
  const [clusterCollapsed, toggleCluster] = useCollapsedState(`cluster-${cluster.name}`, false);
  const [nodesCollapsed, toggleNodes] = useCollapsedState(`nodes-${cluster.name}`, false);
  
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
  }).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [cluster.nodes, term]);

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
              <span>⚠️</span>
              <span>{cluster.error}</span>
            </div>
          )}
          
          {cluster.failed_nodes?.length > 0 && (
            <div className="global-error" style={{ marginBottom: "1.5rem" }}>
              <span>⚠️</span>
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
                          <th key={col.id} style={{ width: col.width }}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNodes.length === 0 ? (
                        <tr><td colSpan={activeColsCount} className="empty-state">No nodes found</td></tr>
                      ) : (
                        [...filteredNodes].map((n, i) => {
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
                                    ? <span className="badge badge-online">🟢 Online</span> 
                                    : <span className="badge badge-offline">🔴 Offline</span>}
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
            </CollapsibleSection>
          )}

          <ResourceSection title="Virtual Machines" typeFilter="VM" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} sectionKey={`vms-${cluster.name}`} />
          <ResourceSection title="LXC Containers" typeFilter="LXC" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} sectionKey={`lxcs-${cluster.name}`} />
        </CollapsibleSection>
    </section>
  );
}
