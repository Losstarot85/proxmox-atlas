import React from "react";
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";

export function ClusterSection({ cluster }) {
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
                  const cpuPercent = isOnline && n.maxcpu > 0 ? (n.cpu * 100).toFixed(1) : 0;
                  const ramPercent = isOnline && n.maxmem > 0 ? (n.mem / n.maxmem * 100).toFixed(1) : 0;

                  return (
                    <tr key={n.name}>
                      <td style={{ fontWeight: 500 }}>{n.name}</td>
                      <td>
                        {isOnline 
                          ? <span className="badge badge-online">🟢 Online</span> 
                          : <span className="badge badge-offline">🔴 Offline</span>}
                      </td>
                      <td className="mono-cell">{isOnline ? formatLoad(n.loadavg) : "-"}</td>
                      <td>
                        {isOnline ? (
                          <div className="progress-bar-inline">
                            <span className="progress-label">{cpuPercent}%</span>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${cpuPercent}%` }}></div>
                            </div>
                            <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{n.maxcpu}C</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td>
                        {isOnline ? (
                          <div className="progress-bar-inline">
                            <span className="progress-label">{ramPercent}%</span>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${ramPercent}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)' }}></div>
                            </div>
                            <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(n.maxmem)}</span>
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

      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={cluster.resources} />
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={cluster.resources} />
    </section>
  );
}
