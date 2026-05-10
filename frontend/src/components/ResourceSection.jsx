import React, { useMemo, useState } from "react";
import { formatCPU, formatBytesToGB, formatNetwork, formatIO, formatPressure } from "../utils/formatters";
import { Sparkline } from "./Sparkline";

const VIRTUAL_THRESHOLD = 100;

// Sub-component for resources (VM, LXC) with metrics
export function ResourceSection({ title, typeFilter, resources, clusterName, globalHistory, metricsMap, searchQuery = "", onOpenTimeMachine }) {
  const [showAll, setShowAll] = useState(false);
  const term = searchQuery.toLowerCase();
  const filtered = useMemo(() => {
    const list = resources.filter(r => {
      if (r.type !== typeFilter) return false;
      if (!term) return true;
      const cpuStr = r.maxcpu ? `${r.maxcpu}c` : "";
      const ramStr = r.maxmem ? formatBytesToGB(r.maxmem).toLowerCase() : "";

      return (
        (r.name || "").toLowerCase().includes(term) ||
        String(r.vmid).includes(term) ||
        (r.status || "").toLowerCase().includes(term) ||
        (r.node || "").toLowerCase().includes(term) ||
        (r.pool || "").toLowerCase().includes(term) ||
        (r.tags || "").toLowerCase().includes(term) ||
        cpuStr.includes(term) ||
        ramStr.includes(term) ||
        (r.ips || []).some(ip => ip.includes(term))
      );
    });
    list.sort((a, b) => a.vmid - b.vmid);
    return list;
  }, [resources, typeFilter, term]);

  if (filtered.length === 0) {
    return null;
  }

  const needsVirtualization = filtered.length > VIRTUAL_THRESHOLD && !showAll;
  const visible = needsVirtualization ? filtered.slice(0, VIRTUAL_THRESHOLD) : filtered;

  return (
    <>
      <h3 className="section-title">{title} {filtered.length > VIRTUAL_THRESHOLD && <span style={{fontWeight: 400, fontSize: '0.85rem', opacity: 0.7}}>({filtered.length} total)</span>}</h3>
      <div className="table-wrapper">
        <div className="responsive-table">
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: "5%" }}>ID</th>
                <th style={{ width: "8%" }}>Name</th>
                <th style={{ width: "6%" }}>Status</th>
                <th style={{ width: "10%" }}>CPU Usage</th>
                <th style={{ width: "10%" }}>RAM Usage</th>
                <th style={{ width: "10%" }}>Network (In/Out)</th>
                <th style={{ width: "10%" }}>Disk IO</th>
                <th style={{ width: "5%" }}>CPU Stall</th>
                <th style={{ width: "5%" }}>RAM Stall</th>
                <th style={{ width: "5%" }}>IO Stall</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, idx) => {
                const isRunning = r.status === "running";
                const cpuPercent = isRunning && r.maxcpu > 0 ? (r.cpu * 100).toFixed(1) : 0;
                const ramPercent = isRunning && r.maxmem > 0 ? (r.mem / r.maxmem * 100).toFixed(1) : 0;

                const cm = metricsMap[`${clusterName}-${r.type}-${r.vmid}`] || { cpu: [], ram: [] };
                const cpuHistory = cm.cpu;
                const ramHistory = cm.ram;

                return (
                    <React.Fragment key={`${r.type}-${r.vmid}`}>
                      <tr
                        id={`row-${r.type}-${r.vmid}`}
                        onClick={() => onOpenTimeMachine && onOpenTimeMachine({ id: r.vmid, type: r.type, name: r.name })}
                      style={{ cursor: 'pointer', '--row-index': idx }}
                      className="hoverable-row"
                    >
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Sparkline data={cpuHistory} color="#3b82f6" />
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                              <span style={{ fontWeight: 600, minWidth: '45px' }}>{cpuPercent}%</span>
                              <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{r.maxcpu}C</span>
                            </div>
                          </div>
                        ) : "-"}
                      </td>
                      <td>
                        {isRunning ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Sparkline data={ramHistory} color="#8b5cf6" />
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                              <span style={{ fontWeight: 600, minWidth: '45px' }}>{ramPercent}%</span>
                              <span className="mono-cell" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{formatBytesToGB(r.maxmem)}</span>
                            </div>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="mono-cell">{isRunning ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "-"}</td>
                      <td className="mono-cell">{isRunning ? formatIO(r.diskread, r.diskwrite) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_cpu > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_cpu) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_ram > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_ram) : "-"}</td>
                      <td className="mono-cell" style={{ color: r.pressure_io > 10 ? 'var(--warning)' : 'inherit' }}>{isRunning ? formatPressure(r.pressure_io) : "-"}</td>
                    </tr>
                    {(r.pool || r.node || r.tags || (r.ips && r.ips.length > 0)) && (
                      <tr style={{ backgroundColor: 'transparent' }}>
                        <td colSpan="10" style={{ paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
                          <div className="tags-container" style={{ margin: 0 }}>
                            {r.node && <span className="resource-tag node-tag">node: {r.node}</span>}
                            {r.pool && <span className="resource-tag pool-tag">pool: {r.pool}</span>}
                            {r.tags && r.tags.split(',').map(t => t.trim()).filter(t => t).map(tag => (
                              <span key={tag} className="resource-tag generic-tag">tag: {tag}</span>
                            ))}
                            {r.ips && r.ips.map(ip => (
                              <span key={ip} className="resource-tag ip-tag">{ip}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {needsVirtualization && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <button className="btn" onClick={() => setShowAll(true)}>
            Show all {filtered.length} items ({filtered.length - VIRTUAL_THRESHOLD} hidden)
          </button>
        </div>
      )}
    </>
  );
}
