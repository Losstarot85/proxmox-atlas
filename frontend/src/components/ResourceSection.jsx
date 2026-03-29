import React from "react";
import { formatCPU, formatBytesToGB, formatNetwork } from "../utils/formatters";

// Sotto-componente per le risorse (VM, LXC) con metriche
export function ResourceSection({ title, typeFilter, resources }) {
  const filtered = resources.filter(r => r.type === typeFilter);

  return (
    <section>
      <h2>{title}</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>CPU Usage</th>
            <th>RAM Usage</th>
            <th>Net (In / Out)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan="6" className="empty-row">Nessun elemento trovato</td></tr>
          ) : (
            filtered.map(r => {
              const isRunning = r.status === "running";
              return (
                <tr key={`${r.type}-${r.vmid}`}>
                  <td>{r.vmid}</td>
                  <td>{r.name}</td>
                  <td>
                    {isRunning 
                      ? <span className="status-badge running">🟢 Running</span>
                      : <span className="status-badge stopped">🔴 Stopped</span>
                    }
                  </td>
                  <td>{isRunning ? `${formatCPU(r.cpu)} / ${r.maxcpu} Core` : "-"}</td>
                  <td>{isRunning ? `${formatBytesToGB(r.mem)} / ${formatBytesToGB(r.maxmem)}` : "-"}</td>
                  <td>{isRunning ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "-"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
