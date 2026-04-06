import React from "react";
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";
import { Sparkline } from "./Sparkline";
import { UptimePulse } from "./UptimePulse";

export function ClusterSection({ cluster, history, onOpenTimeMachine }) {
  return (
    <section className="cluster-section">
      <div className="cluster-header">
        <h2>{cluster.name}</h2>
        <span className="last-update">
          Updated: {cluster.last_update || "—"}
        </span>
      </div>

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

      <h3 className="section-title">Physical Nodes</h3>
      
      <div className="table-wrapper">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Status</th>
                <th>Load Avg</th>
                <th>CPU Usage</th>
                <th>RAM Usage</th>
                <th>Storage</th>
                <th>Network (In/Out)</th>
                <th>IO Wait</th>
                <th>CPU Stall</th>
                <th>RAM Stall</th>
                <th>IO Stall</th>
              </tr>
            </thead>
            <tbody>
              {!cluster.nodes || cluster.nodes.length === 0 ? (
                <tr><td colSpan="11" className="empty-state">No nodes found</td></tr>
              ) : (
                cluster.nodes.map(n => {
                  const isOnline = n.status === "online";
                  const cpuPercent = isOnline && n.maxcpu > 0 ? ((n.cpu || 0) * 100).toFixed(1) : 0;
                  const ramPercent = isOnline && n.maxmem > 0 ? ((n.mem || 0) / n.maxmem * 100).toFixed(1) : 0;

                  const nodeHistory = history?.map(h => {
                     const clusterMatch = h.clusters?.find(c => c.name === cluster.name);
                     const nodeMatch = clusterMatch?.nodes?.find(nd => nd.name === n.name);
                     return {
                       timestamp: h.timestamp,
                       cpuPercent: nodeMatch && nodeMatch.maxcpu > 0 ? Number(((nodeMatch.cpu || 0) * 100).toFixed(1)) : 0,
                       ramPercent: nodeMatch && nodeMatch.maxmem > 0 ? Number(((nodeMatch.mem || 0) / nodeMatch.maxmem * 100).toFixed(1)) : 0
                     };
                  }) || [];

                  const nodeHistoryBlocks = history?.map(h => {
                    const clusterMatch = h.clusters?.find(c => c.name === cluster.name);
                    const nodeMatch = clusterMatch?.nodes?.find(nd => nd.name === n.name);
                    return {
                      status: nodeMatch ? nodeMatch.status : "unknown"
                    };
                  }) || [];

                  return (
                    <tr 
                      id={`row-NODE-${n.name}`}
                      key={n.name} 
                      onClick={() => onOpenTimeMachine({ id: n.name, type: 'NODE', name: n.name })}
                      style={{ cursor: 'pointer' }}
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
                      <td className="mono-cell">{isOnline ? formatLoad(n.loadavg) : "-"}</td>
                      <td>
                        {isOnline ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Sparkline data={nodeHistory} dataKey="cpuPercent" color="#3b82f6" />
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
                            <Sparkline data={nodeHistory} dataKey="ramPercent" color="#8b5cf6" />
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                              <span style={{ fontWeight: 600, minWidth: '45px' }}>{ramPercent}%</span>
                              <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(n.maxmem)}</span>
                            </div>
                          </div>
                        ) : "-"}
                      </td>
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
                      <td className="mono-cell">{isOnline ? `⬇ ${formatNetwork(n.netin)} / ⬆ ${formatNetwork(n.netout)}` : "-"}</td>
                      <td className="mono-cell">{isOnline ? formatPressure(n.iowait) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_cpu) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_ram) : "-"}</td>
                      <td className="mono-cell" style={{ color: n.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isOnline ? formatPressure(n.pressure_io) : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={cluster.resources} clusterName={cluster.name} history={history} onOpenTimeMachine={onOpenTimeMachine} />
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={cluster.resources} clusterName={cluster.name} history={history} onOpenTimeMachine={onOpenTimeMachine} />
    </section>
  );
}
