import React from "react";
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";
import { Sparkline } from "./Sparkline";

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
                <th>Network (In/Out)</th>
                <th>IO Wait</th>
                <th>CPU Stall</th>
                <th>RAM Stall</th>
                <th>IO Stall</th>
              </tr>
            </thead>
            <tbody>
              {!cluster.nodes || cluster.nodes.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No nodes found</td></tr>
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

                  return (
                    <tr 
                      key={n.name} 
                      onClick={() => onOpenTimeMachine({ id: n.name, type: 'NODE', name: n.name })}
                      style={{ cursor: 'pointer' }}
                      className="hoverable-row"
                    >
                      <td style={{ fontWeight: 500 }}>{n.name}</td>
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
