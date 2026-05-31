import React, { useMemo, useState } from "react";
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { UptimePulse } from "./UptimePulse";
import { ClusterHealthBar, classifyNode, classifyResource } from "./ClusterHealthBar";

export function ClusterSection({ cluster, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine, onOpenResource }) {
  const [healthFilter, setHealthFilter] = useState(null);
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

  if (visibleNodes.length === 0 && visibleResources.length === 0) {
    return null;
  }

  return (
    <section className="cluster-section">
      <div className="cluster-header">
        <h2>{cluster.name}</h2>
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
        <>
          <h3 className="section-title">Physical Nodes</h3>
      
      <div className="table-wrapper">
        <div className="responsive-table">
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: "15%" }}>Node</th>
                <th style={{ width: "6%" }}>Status</th>
                <th style={{ width: "15%" }}>CPU USAGE</th>
                <th style={{ width: "15%" }}>RAM USAGE</th>
                <th style={{ width: "15%" }}>Network (In/Out)</th>
                <th style={{ width: "15%" }}>Storage</th>
                <th style={{ width: "5%" }}>Load</th>
                <th style={{ width: "5%" }}>IO Wait</th>
                <th style={{ width: "5%" }}>CPU Stall</th>
                <th style={{ width: "5%" }}>RAM Stall</th>
                <th style={{ width: "5%" }}>IO Stall</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.length === 0 ? (
                <tr><td colSpan="11" className="empty-state">No nodes found</td></tr>
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
                      <td style={{ fontWeight: 500 }}>
                        {n.name}
                        <UptimePulse historyBlocks={nodeHistoryBlocks} />
                      </td>
                      <td>
                        {isOnline 
                          ? <span className="badge badge-online">🟢 Online</span> 
                          : <span className="badge badge-offline">🔴 Offline</span>}
                      </td>
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
                      <td className="mono-cell">{isOnline ? `⬇ ${formatNetwork(n.netin)} / ⬆ ${formatNetwork(n.netout)}` : "-"}</td>
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
                      <td className="mono-cell">{isOnline ? formatLoad(n.loadavg) : "-"}</td>
                      <td className="mono-cell">{isOnline ? formatPressure(n.iowait) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_cpu) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_ram) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_io) : "-"}</td>
                    </tr>
                    <tr style={{ backgroundColor: 'transparent' }}>
                      <td colSpan="11" style={{ paddingTop: '0.5rem', paddingBottom: '0.75rem', borderTop: '1px solid var(--border)' }}>
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
      </>
      )}

      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} />
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={filteredResources} clusterName={cluster.name} globalHistory={globalHistory} metricsMap={metricsMap} searchQuery={searchQuery} onOpenTimeMachine={onOpenTimeMachine} onOpenResource={onOpenResource} />
    </section>
  );
}
