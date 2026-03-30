import React from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";

// Sotto-componente per le risorse (VM, LXC) con metriche
export function ResourceSection({ title, typeFilter, resources }) {
  const filtered = resources.filter(r => r.type === typeFilter);

  return (
    <>
      <h3 className="section-title">{title}</h3>
      <div className="table-wrapper">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>CPU Usage</th>
                <th>RAM Usage</th>
                <th>Network (In/Out)</th>
                <th>Disk IO</th>
                <th>CPU Stall</th>
                <th>RAM Stall</th>
                <th>IO Stall</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No {typeFilter}s found</td></tr>
              ) : (
                filtered.map(r => {
                  const isRunning = r.status === "running";
                  const cpuPercent = isRunning && r.maxcpu > 0 ? (r.cpu * 100).toFixed(1) : 0;
                  const ramPercent = isRunning && r.maxmem > 0 ? (r.mem / r.maxmem * 100).toFixed(1) : 0;

                  return (
                    <tr key={`${r.type}-${r.vmid}`}>
                      <td className="mono-cell">{r.vmid}</td>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>
                        {isRunning 
                          ? <span className="badge badge-online">🟢 Running</span>
                          : <span className="badge badge-offline">🔴 Stopped</span>
                        }
                      </td>
                      <td>
                        {isRunning ? (
                          <div className="progress-bar-inline">
                            <span className="progress-label">{cpuPercent}%</span>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${cpuPercent}%` }}></div>
                            </div>
                            <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{r.maxcpu}C</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td>
                        {isRunning ? (
                          <div className="progress-bar-inline">
                            <span className="progress-label">{ramPercent}%</span>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${ramPercent}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)' }}></div>
                            </div>
                            <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(r.maxmem)}</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="mono-cell">{isRunning ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "-"}</td>
                      <td className="mono-cell">{isRunning ? formatIO(r.diskread, r.diskwrite) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_cpu) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_ram) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_io) : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
