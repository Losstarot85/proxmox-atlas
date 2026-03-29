import React from "react";
import { ResourceSection } from "./ResourceSection";

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
      <table className="data-table">
        <thead>
          <tr>
            <th>Node Name</th>
            <th>Status</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {!cluster.nodes || cluster.nodes.length === 0 ? (
            <tr><td colSpan="3" className="empty-row">Nessun nodo trovato</td></tr>
          ) : (
            cluster.nodes.map(n => (
              <tr key={n.name}>
                <td>{n.name}</td>
                <td>
                  {n.status === "online" 
                    ? <span className="status-badge running">🟢 Online</span> 
                    : <span className="status-badge stopped">🔴 Offline</span>}
                </td>
                <td>{n.type || "pve"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={cluster.resources} />
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={cluster.resources} />
    </div>
  );
}
