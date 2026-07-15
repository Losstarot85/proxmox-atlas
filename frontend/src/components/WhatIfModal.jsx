import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../config";
import { SkeletonSimulation } from "./Skeletons";
import { Tooltip } from "./EmptyState";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}

export function WhatIfModal({ cluster, node, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!cluster || !node) return;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/what-if?cluster=${encodeURIComponent(cluster)}&remove_node=${encodeURIComponent(node)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { setData(json); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [cluster, node]);

  useEffect(() => {
    // Focus the modal content area on mount
    modalRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      }
      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!cluster || !node) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div 
        ref={modalRef}
        tabIndex="-1"
        className="modal-content whatif-modal" 
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatif-title"
        style={{ outline: "none" }}
      >
        <div className="modal-header">
          <h3 id="whatif-title" style={{ display: 'inline-flex', alignItems: 'center' }}>
            ⚡ What-If: Removing <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>{node}</span>
            <Tooltip text="This simulation calculates memory, CPU, and storage impact of removing the selected node, identifying if there is enough reserve capacity in the rest of the cluster to host all displaced virtual guests." />
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close dialogue">✕</button>
        </div>

        {loading && (
          <SkeletonSimulation />
        )}

        {error && (
          <div className="global-error" style={{ margin: '1rem' }}>
            <span>⚠️</span>
            <span>Simulation error: {error}</span>
          </div>
        )}

        {data && !loading && (
          <div className="whatif-body">
            {/* Summary Cards */}
            <div className="whatif-summary">
              <div className={`whatif-card ${data.summary.orphaned > 0 ? 'danger' : 'success'}`}>
                <div className="whatif-card-value">{data.summary.total_displaced_vms}</div>
                <div className="whatif-card-label">Displaced</div>
              </div>
              <div className={`whatif-card ${data.summary.migratable > 0 ? 'success' : ''}`}>
                <div className="whatif-card-value">{data.summary.migratable}</div>
                <div className="whatif-card-label">Migratable</div>
              </div>
              <div className={`whatif-card ${data.summary.orphaned > 0 ? 'danger' : 'success'}`}>
                <div className="whatif-card-value">{data.summary.orphaned}</div>
                <div className="whatif-card-label">Orphaned</div>
              </div>
              <div className={`whatif-card ${data.summary.congested_count > 0 ? 'warning' : 'success'}`}>
                <div className="whatif-card-value">{data.summary.congested_count}</div>
                <div className="whatif-card-label">Congested Nodes</div>
              </div>
            </div>

            {/* Migration Plan */}
            {data.migration_plan.length > 0 && (
              <div className="whatif-section">
                <h4>📋 Migration Plan</h4>
                <div className="table-wrapper">
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>VM/LXC</th>
                          <th>Tipo</th>
                          <th>vCPU</th>
                          <th>RAM Usata</th>
                          <th>→ Destinazione</th>
                          <th>Fit Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.migration_plan.map((m, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{m.vm.name} <span style={{ opacity: 0.5 }}>({m.vm.vmid})</span></td>
                            <td><span className={`badge ${m.vm.type === 'VM' ? 'badge-online' : 'badge-warning'}`}>{m.vm.type}</span></td>
                            <td className="mono-cell">{m.vm.maxcpu}</td>
                            <td className="mono-cell">{formatBytes(m.vm.mem)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{m.target_node}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="progress-bar-container" style={{ flex: 1, minWidth: '60px' }}>
                                  <div className="progress-bar-fill" style={{
                                    width: `${100 - m.fit_score}%`,
                                    background: m.fit_score > 50 ? 'var(--accent)' : m.fit_score > 20 ? 'var(--warning)' : 'var(--danger)'
                                  }}></div>
                                </div>
                                <span className="mono-cell" style={{ fontSize: '0.8rem' }}>{m.fit_score}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Orphaned VMs */}
            {data.orphaned_vms.length > 0 && (
              <div className="whatif-section">
                <h4 style={{ color: 'var(--danger)' }}>🚫 Orphaned VM/LXC (no node can host them)</h4>
                <div className="table-wrapper">
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>VM/LXC</th>
                          <th>Tipo</th>
                          <th>vCPU</th>
                          <th>RAM Usata</th>
                          <th>RAM Allocata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orphaned_vms.map((vm, i) => (
                          <tr key={i} style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                            <td style={{ fontWeight: 500 }}>{vm.name} <span style={{ opacity: 0.5 }}>({vm.vmid})</span></td>
                            <td><span className="badge badge-offline">{vm.type}</span></td>
                            <td className="mono-cell">{vm.maxcpu}</td>
                            <td className="mono-cell">{formatBytes(vm.mem)}</td>
                            <td className="mono-cell">{formatBytes(vm.maxmem)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Surviving Nodes State After Migration */}
            {data.surviving_nodes.length > 0 && (
              <div className="whatif-section">
                <h4>🖥️ Post-Migration Node Status</h4>
                <div className="table-wrapper">
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Nodo</th>
                          <th>vCPU After</th>
                          <th>RAM After</th>
                          <th>VM/LXC Count</th>
                          <th>Stato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.surviving_nodes.map((sn, i) => (
                          <tr key={i} style={{ background: sn.congested ? 'rgba(245, 158, 11, 0.1)' : 'transparent' }}>
                            <td style={{ fontWeight: 500 }}>{sn.name}</td>
                            <td className="mono-cell">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="progress-bar-container" style={{ flex: 1, minWidth: '50px' }}>
                                  <div className="progress-bar-fill" style={{
                                    width: `${Math.min(100, sn.vcpu_ratio_after)}%`,
                                    background: sn.vcpu_ratio_after > 100 ? 'var(--danger)' : sn.vcpu_ratio_after > 80 ? 'var(--warning)' : 'var(--accent)'
                                  }}></div>
                                </div>
                                <span>{sn.vcpu_ratio_after}%</span>
                              </div>
                            </td>
                            <td className="mono-cell">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="progress-bar-container" style={{ flex: 1, minWidth: '50px' }}>
                                  <div className="progress-bar-fill" style={{
                                    width: `${Math.min(100, sn.mem_ratio_after)}%`,
                                    background: sn.mem_ratio_after > 85 ? 'var(--danger)' : sn.mem_ratio_after > 70 ? 'var(--warning)' : 'var(--accent)'
                                  }}></div>
                                </div>
                                <span>{sn.mem_ratio_after}%</span>
                              </div>
                            </td>
                            <td className="mono-cell">{sn.vm_count_after}</td>
                            <td>
                              {sn.congested
                                ? <span className="badge badge-offline">⚠️ Congested</span>
                                : <span className="badge badge-online">✅ OK</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {data.summary.total_displaced_vms === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '1.2rem' }}>✅ No running VM or LXC on this node.</p>
                <p>Removing it would have no impact on virtualized resources.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
