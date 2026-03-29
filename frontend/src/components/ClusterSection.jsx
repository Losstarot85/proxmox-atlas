import React from "react";
import { ResourceSection } from "./ResourceSection";
import { formatCPU, formatBytesToGB, formatNetwork, formatPressure, formatLoad } from "../utils/formatters";

export function ClusterSection({ cluster }) {
  return (
    <div className="cluster-section">
      <div className="cluster-header">
        <h2>{cluster.name}</h2>
        <span className="cluster-update">
          Aggiornato: {cluster.last_update || "—"}
        </span>
      </div>

      {cluster.error && (
        <p className="error">⚠️ {cluster.error}</p>
      )}
      {cluster.failed_nodes?.length > 0 && (
        <p className="error">
          ⚠️ Dati parziali — nodi non raggiungibili: {cluster.failed_nodes.join(", ")}
        </p>
      )}

      <h3>Nodes</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Node Name</th>
              <th>Status</th>
              <th>Server Load</th>
              <th>CPU Usage</th>
              <th>RAM Usage</th>
              <th>Net (In / Out)</th>
              <th>IO Wait</th>
              <th>CPU Stall</th>
              <th>RAM Stall</th>
              <th>IO Stall</th>
            </tr>
          </thead>
          <tbody>
            {!cluster.nodes || cluster.nodes.length === 0 ? (
              <tr><td colSpan="10" className="empty-row">Nessun nodo trovato</td></tr>
            ) : (
              cluster.nodes.map(n => {
                const isOnline = n.status === "online";
                return (
                  <tr key={n.name}>
                    <td>{n.name}</td>
                    <td>
                      {isOnline 
                        ? <span className="status-badge running">🟢 Online</span> 
                        : <span className="status-badge stopped">🔴 Offline</span>}
                    </td>
                    <td>{isOnline ? formatLoad(n.loadavg) : "-"}</td>
                    <td>{isOnline ? `${formatCPU(n.cpu)} / ${n.maxcpu} Core` : "-"}</td>
                    <td>{isOnline ? `${formatBytesToGB(n.mem)} / ${formatBytesToGB(n.maxmem)}` : "-"}</td>
                    <td>{isOnline ? `⬇ ${formatNetwork(n.netin)} / ⬆ ${formatNetwork(n.netout)}` : "-"}</td>
                    <td>{isOnline ? formatPressure(n.iowait) : "-"}</td>
                    <td>{isOnline ? formatPressure(n.pressure_cpu) : "-"}</td>
                    <td>{isOnline ? formatPressure(n.pressure_ram) : "-"}</td>
                    <td>{isOnline ? formatPressure(n.pressure_io) : "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={cluster.resources} />
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={cluster.resources} />
    </div>
  );
}
