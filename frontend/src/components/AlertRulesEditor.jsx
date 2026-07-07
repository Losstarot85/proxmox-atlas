import React, { useState, useEffect, useMemo } from "react";
import { useAlertRules, useSaveAlertRules } from "../hooks/useApiQueries";

export function AlertRulesEditor({ clusters = [] }) {
  const { data: serverRules, isLoading, isError } = useAlertRules();
  const saveRulesMutation = useSaveAlertRules();

  // Local state for interactive editing and real-time previews
  const [localRules, setLocalRules] = useState(null);
  const [overrideCluster, setOverrideCluster] = useState("");
  const [overrideResource, setOverrideResource] = useState(""); // Can be node name or vmid
  const [overrideMetric, setOverrideMetric] = useState("cpu_threshold_percent");
  const [overrideValue, setOverrideValue] = useState(90);

  // Initialize local rules when server rules load
  useEffect(() => {
    if (serverRules) {
      setLocalRules(JSON.parse(JSON.stringify(serverRules)));
    }
  }, [serverRules]);

  // Sync default options for override creation
  useEffect(() => {
    if (clusters.length > 0 && !overrideCluster) {
      setOverrideCluster(clusters[0].name);
    }
  }, [clusters, overrideCluster]);

  // Flattened list of available resources in selected override cluster
  const availableResources = useMemo(() => {
    if (!overrideCluster) return [];
    const c = clusters.find(cl => cl.name === overrideCluster);
    if (!c) return [];

    const resources = [];
    
    // Add nodes
    if (c.nodes) {
      c.nodes.forEach(n => {
        resources.push({
          id: n.name,
          name: `${n.name} (Physical Node)`,
          type: "node"
        });
      });
    }

    // Add VMs & LXCs
    if (c.resources) {
      c.resources.forEach(r => {
        resources.push({
          id: String(r.vmid),
          name: `${r.vmid} - ${r.name} (${r.type})`,
          type: r.type.toLowerCase()
        });
      });
    }

    return resources;
  }, [clusters, overrideCluster]);

  useEffect(() => {
    if (availableResources.length > 0) {
      setOverrideResource(availableResources[0].id);
    } else {
      setOverrideResource("");
    }
  }, [availableResources]);

  // Evaluate which resources would trigger under current local rules
  const previewTriggers = useMemo(() => {
    if (!localRules || clusters.length === 0) return [];
    
    const triggers = [];

    // Helper to resolve effective threshold
    const getLocalEffectiveRule = (ruleKey, clusterName, id, type) => {
      // Check if global rule type is enabled
      const enabled = localRules.enabled_rules?.[type];
      if (enabled === false) return Infinity;

      // Check overrides
      const overrideKey = `${clusterName}:${id}`;
      const over = localRules.overrides?.[overrideKey];
      if (over && over[ruleKey] !== undefined) {
        return over[ruleKey];
      }

      return localRules[ruleKey] ?? Infinity;
    };

    clusters.forEach(c => {
      const clusterName = c.name;

      // 1. Evaluate Nodes
      if (c.nodes) {
        c.nodes.forEach(n => {
          if (n.status !== "online") return;

          // CPU Node
          const cpuThresh = getLocalEffectiveRule("cpu_threshold_percent", clusterName, n.name, "cpu");
          const cpuVal = (n.cpu || 0) * 100;
          if (cpuVal > cpuThresh) {
            triggers.push({
              cluster: clusterName,
              resource: `${n.name} (Node)`,
              metric: "CPU Usage",
              value: `${cpuVal.toFixed(1)}%`,
              threshold: `${cpuThresh}%`,
              severity: cpuVal > 95 ? "critical" : "warning"
            });
          }

          // RAM Node
          if (n.maxmem > 0) {
            const ramThresh = getLocalEffectiveRule("ram_threshold_percent", clusterName, n.name, "ram");
            const ramVal = ((n.mem || 0) / n.maxmem) * 100;
            if (ramVal > ramThresh) {
              triggers.push({
                cluster: clusterName,
                resource: `${n.name} (Node)`,
                metric: "RAM Usage",
                value: `${ramVal.toFixed(1)}%`,
                threshold: `${ramThresh}%`,
                severity: ramVal > 95 ? "critical" : "warning"
              });
            }
          }

          // Disk Nodes
          if (n.storage_pools) {
            const diskThresh = getLocalEffectiveRule("disk_usage_threshold_percent", clusterName, n.name, "disk");
            n.storage_pools.forEach(sp => {
              if (sp.active === 1 && sp.total > 0) {
                const diskVal = (sp.used / sp.total) * 100;
                if (diskVal > diskThresh) {
                  triggers.push({
                    cluster: clusterName,
                    resource: `${n.name} (Storage: ${sp.storage})`,
                    metric: "Storage Usage",
                    value: `${diskVal.toFixed(1)}%`,
                    threshold: `${diskThresh}%`,
                    severity: diskVal > 95 ? "critical" : "warning"
                  });
                }
              }
            });
          }

          // IO Stall Node
          const ioThresh = getLocalEffectiveRule("io_stall_threshold_percent", clusterName, n.name, "iowait");
          const ioVal = n.pressure_io || 0;
          if (ioVal > ioThresh) {
            triggers.push({
              cluster: clusterName,
              resource: `${n.name} (Node)`,
              metric: "IO Pressure Stall",
              value: `${ioVal.toFixed(1)}%`,
              threshold: `${ioThresh}%`,
              severity: "warning"
            });
          }

          // RAM Pressure Node
          const ramPresThresh = getLocalEffectiveRule("ram_pressure_threshold_percent", clusterName, n.name, "ram_pressure");
          const ramPresVal = n.pressure_ram || 0;
          if (ramPresVal > ramPresThresh) {
            triggers.push({
              cluster: clusterName,
              resource: `${n.name} (Node)`,
              metric: "RAM Memory Stall",
              value: `${ramPresVal.toFixed(1)}%`,
              threshold: `${ramPresThresh}%`,
              severity: "warning"
            });
          }

          // Network Node
          const netThresh = getLocalEffectiveRule("network_threshold_mbps", clusterName, n.name, "network");
          const netVal = (((n.netin || 0) + (n.netout || 0)) * 8) / 1_000_000;
          if (netVal > netThresh) {
            triggers.push({
              cluster: clusterName,
              resource: `${n.name} (Node)`,
              metric: "Network Bandwidth",
              value: `${netVal.toFixed(1)} Mbps`,
              threshold: `${netThresh} Mbps`,
              severity: "warning"
            });
          }
        });
      }

      // 2. Evaluate VMs / LXCs
      if (c.resources) {
        // Map VM backups
        const vmidToLatestBackup = {};
        if (c.backups) {
          c.backups.forEach(b => {
            const bv = b.vmid;
            if (bv != null) {
              if (!vmidToLatestBackup[bv] || b.ctime > vmidToLatestBackup[bv]) {
                vmidToLatestBackup[bv] = b.ctime;
              }
            }
          });
        }

        c.resources.forEach(r => {
          if (r.status !== "running") return;
          const vmid = String(r.vmid);

          // CPU VM
          const cpuThresh = getLocalEffectiveRule("cpu_threshold_percent", clusterName, vmid, "cpu");
          const cpuVal = (r.cpu || 0) * 100;
          if (cpuVal > cpuThresh) {
            triggers.push({
              cluster: clusterName,
              resource: `${r.name} (${r.type} ${vmid})`,
              metric: "VM CPU Usage",
              value: `${cpuVal.toFixed(1)}%`,
              threshold: `${cpuThresh}%`,
              severity: "warning"
            });
          }

          // RAM VM
          if (r.maxmem > 0) {
            const ramThresh = getLocalEffectiveRule("ram_threshold_percent", clusterName, vmid, "ram");
            const ramVal = ((r.mem || 0) / r.maxmem) * 100;
            if (ramVal > ramThresh) {
              triggers.push({
                cluster: clusterName,
                resource: `${r.name} (${r.type} ${vmid})`,
                metric: "VM RAM Usage",
                value: `${ramVal.toFixed(1)}%`,
                threshold: `${ramThresh}%`,
                severity: "warning"
              });
            }
          }

          // Backup VM
          const backupThresh = getLocalEffectiveRule("backup_max_days", clusterName, vmid, "backup");
          if (backupThresh !== Infinity) {
            const latestBackup = vmidToLatestBackup[r.vmid];
            if (latestBackup === undefined) {
              triggers.push({
                cluster: clusterName,
                resource: `${r.name} (${r.type} ${vmid})`,
                metric: "Backup Missing",
                value: "Never backed up",
                threshold: `${backupThresh} days`,
                severity: "warning"
              });
            } else {
              const daysSince = (Date.now() / 1000 - latestBackup) / 86400;
              if (daysSince > backupThresh) {
                triggers.push({
                  cluster: clusterName,
                  resource: `${r.name} (${r.type} ${vmid})`,
                  metric: "Stale Backup",
                  value: `${Math.floor(daysSince)} days ago`,
                  threshold: `${backupThresh} days`,
                  severity: "warning"
                });
              }
            }
          }
        });
      }
    });

    return triggers;
  }, [localRules, clusters]);

  // Handle global key threshold changes
  const handleThresholdChange = (key, value) => {
    setLocalRules(prev => ({
      ...prev,
      [key]: Number(value)
    }));
  };

  // Toggle rule types
  const handleToggleRule = (typeKey) => {
    setLocalRules(prev => {
      const next = { ...prev };
      if (!next.enabled_rules) next.enabled_rules = {};
      next.enabled_rules[typeKey] = !next.enabled_rules[typeKey];
      return next;
    });
  };

  // Save rules
  const handleSave = () => {
    saveRulesMutation.mutate(localRules, {
      onSuccess: () => {
        alert("Rules saved successfully! The background engine has been refreshed.");
      },
      onError: (err) => {
        alert(`Error saving rules: ${err.message}`);
      }
    });
  };

  // Add override
  const handleAddOverride = (e) => {
    e.preventDefault();
    if (!overrideResource) return;

    const key = `${overrideCluster}:${overrideResource}`;
    
    setLocalRules(prev => {
      const next = { ...prev };
      if (!next.overrides) next.overrides = {};
      if (!next.overrides[key]) next.overrides[key] = {};
      
      next.overrides[key][overrideMetric] = Number(overrideValue);
      return next;
    });
  };

  // Remove override
  const handleRemoveOverride = (overrideKey, metricKey) => {
    setLocalRules(prev => {
      const next = { ...prev };
      if (next.overrides && next.overrides[overrideKey]) {
        delete next.overrides[overrideKey][metricKey];
        // If resource has no more overridden metrics, clean up key
        if (Object.keys(next.overrides[overrideKey]).length === 0) {
          delete next.overrides[overrideKey];
        }
      }
      return next;
    });
  };

  const getMetricLabel = (key) => {
    switch (key) {
      case "cpu_threshold_percent": return "CPU Threshold";
      case "ram_threshold_percent": return "RAM Threshold";
      case "disk_usage_threshold_percent": return "Storage space";
      case "io_stall_threshold_percent": return "IO Wait Pressure";
      case "network_threshold_mbps": return "Network Saturation";
      case "ram_pressure_threshold_percent": return "RAM Stalls";
      case "backup_max_days": return "Backup max days";
      default: return key;
    }
  };

  if (isLoading || !localRules) {
    return (
      <div className="empty-state glass-card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <span>⏳</span> Loading rules editor...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="empty-state glass-card" style={{ padding: "4rem 2rem", textAlign: "center", borderColor: "var(--danger)" }}>
        <span style={{ color: "var(--danger)" }}>❌</span> Failed to load alert rules from backend.
      </div>
    );
  }

  return (
    <div className="alert-rules-editor-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
      {/* Rules Config Panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Global Threshold Sliders */}
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h3 style={{ margin: 0 }}>Global Threshold Rules</h3>
            <button className="btn" onClick={handleSave} disabled={saveRulesMutation.isPending}>
              {saveRulesMutation.isPending ? "Saving..." : "💾 Save Rules"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* CPU Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.cpu ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.cpu ?? true}
                  onChange={() => handleToggleRule("cpu")}
                />
                <div>
                  <strong>CPU Usage Alert</strong>
                  <p>Triggers warning alerts when hosts/vms CPU remains elevated</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="10"
                  max="99"
                  value={localRules.cpu_threshold_percent}
                  onChange={(e) => handleThresholdChange("cpu_threshold_percent", e.target.value)}
                  disabled={!(localRules.enabled_rules?.cpu ?? true)}
                />
                <span className="badge">{localRules.cpu_threshold_percent}%</span>
              </div>
            </div>

            {/* RAM Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.ram ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.ram ?? true}
                  onChange={() => handleToggleRule("ram")}
                />
                <div>
                  <strong>Memory Usage Alert</strong>
                  <p>Triggers alerts when RAM allocated exceeds thresholds</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="10"
                  max="99"
                  value={localRules.ram_threshold_percent}
                  onChange={(e) => handleThresholdChange("ram_threshold_percent", e.target.value)}
                  disabled={!(localRules.enabled_rules?.ram ?? true)}
                />
                <span className="badge">{localRules.ram_threshold_percent}%</span>
              </div>
            </div>

            {/* Storage Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.disk ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.disk ?? true}
                  onChange={() => handleToggleRule("disk")}
                />
                <div>
                  <strong>Disk Storage Alert</strong>
                  <p>Triggers warning on storage pools approaching full capacity</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="10"
                  max="99"
                  value={localRules.disk_usage_threshold_percent}
                  onChange={(e) => handleThresholdChange("disk_usage_threshold_percent", e.target.value)}
                  disabled={!(localRules.enabled_rules?.disk ?? true)}
                />
                <span className="badge">{localRules.disk_usage_threshold_percent}%</span>
              </div>
            </div>

            {/* IO Stall Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.iowait ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.iowait ?? true}
                  onChange={() => handleToggleRule("iowait")}
                />
                <div>
                  <strong>IO Stall Delay Alert</strong>
                  <p>Triggers when storage operations block processes</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="2"
                  max="80"
                  value={localRules.io_stall_threshold_percent}
                  onChange={(e) => handleThresholdChange("io_stall_threshold_percent", e.target.value)}
                  disabled={!(localRules.enabled_rules?.iowait ?? true)}
                />
                <span className="badge">{localRules.io_stall_threshold_percent}%</span>
              </div>
            </div>

            {/* RAM Pressure Stall Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.ram_pressure ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.ram_pressure ?? true}
                  onChange={() => handleToggleRule("ram_pressure")}
                />
                <div>
                  <strong>RAM Pressure Stall Alert</strong>
                  <p>Triggers when node experiences intensive thrashing stalls</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="2"
                  max="80"
                  value={localRules.ram_pressure_threshold_percent}
                  onChange={(e) => handleThresholdChange("ram_pressure_threshold_percent", e.target.value)}
                  disabled={!(localRules.enabled_rules?.ram_pressure ?? true)}
                />
                <span className="badge">{localRules.ram_pressure_threshold_percent}%</span>
              </div>
            </div>

            {/* Network Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.network ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.network ?? true}
                  onChange={() => handleToggleRule("network")}
                />
                <div>
                  <strong>Network Bandwidth Alert</strong>
                  <p>Triggers when node net I/O exceeds thresholds</p>
                </div>
              </div>
              <div className="rule-slider-wrapper" style={{ flex: 1, minWidth: "260px" }}>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={localRules.network_threshold_mbps}
                  onChange={(e) => handleThresholdChange("network_threshold_mbps", e.target.value)}
                  disabled={!(localRules.enabled_rules?.network ?? true)}
                />
                <span className="badge" style={{ minWidth: "80px" }}>{localRules.network_threshold_mbps} Mbps</span>
              </div>
            </div>

            {/* Backup Rule */}
            <div className={`rule-card-row ${!localRules.enabled_rules?.backup ? "disabled-rule" : ""}`}>
              <div className="rule-info-meta">
                <input 
                  type="checkbox" 
                  checked={localRules.enabled_rules?.backup ?? true}
                  onChange={() => handleToggleRule("backup")}
                />
                <div>
                  <strong>Backup Max Days Alert</strong>
                  <p>Triggers warning when VM backups exceed stale threshold</p>
                </div>
              </div>
              <div className="rule-slider-wrapper">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={localRules.backup_max_days}
                  onChange={(e) => handleThresholdChange("backup_max_days", e.target.value)}
                  disabled={!(localRules.enabled_rules?.backup ?? true)}
                />
                <span className="badge">{localRules.backup_max_days} days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Resource Overrides */}
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1.25rem 0" }}>Per-Resource Overrides</h3>

          {/* Add Override Form */}
          {clusters.length === 0 ? (
            <div className="empty-state">No live clusters to add overrides.</div>
          ) : (
            <form onSubmit={handleAddOverride} style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px dashed var(--border)", marginBottom: "1.5rem" }}>
              <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.75rem" }}>Add Custom Override</strong>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="filter-select-group">
                  <label>Cluster</label>
                  <select value={overrideCluster} onChange={(e) => setOverrideCluster(e.target.value)} className="select-control">
                    {clusters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div className="filter-select-group" style={{ flex: 1, minWidth: "150px" }}>
                  <label>Resource</label>
                  <select value={overrideResource} onChange={(e) => setOverrideResource(e.target.value)} className="select-control">
                    {availableResources.length === 0 && <option value="">No resources found</option>}
                    {availableResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="filter-select-group">
                  <label>Metric</label>
                  <select value={overrideMetric} onChange={(e) => setOverrideMetric(e.target.value)} className="select-control">
                    <option value="cpu_threshold_percent">CPU Limit (%)</option>
                    <option value="ram_threshold_percent">RAM Limit (%)</option>
                    <option value="disk_usage_threshold_percent">Disk Storage Limit (%)</option>
                    <option value="io_stall_threshold_percent">IO Stall Limit (%)</option>
                    <option value="ram_pressure_threshold_percent">RAM Pressure Stall (%)</option>
                    <option value="network_threshold_mbps">Network Limit (Mbps)</option>
                    <option value="backup_max_days">Backup stale limit (days)</option>
                  </select>
                </div>

                <div className="filter-select-group" style={{ width: "90px" }}>
                  <label>Override Value</label>
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(Number(e.target.value))}
                    className="search-input"
                    style={{ padding: "0.5rem", fontSize: "0.85rem", height: "35px", boxSizing: "border-box" }}
                  />
                </div>

                <button type="submit" className="btn" style={{ padding: "0.5rem 1rem", height: "35px" }}>
                  + Add
                </button>
              </div>
            </form>
          )}

          {/* Overrides List Table */}
          {!localRules.overrides || Object.keys(localRules.overrides).length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem", border: "none", color: "var(--text-secondary)" }}>
              No custom overrides configured. Using global rules everywhere.
            </div>
          ) : (
            <div className="table-wrapper">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem" }}>Resource / Target</th>
                    <th style={{ padding: "0.5rem" }}>Metric</th>
                    <th style={{ padding: "0.5rem" }}>Overridden Value</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(localRules.overrides).map(overrideKey => {
                    const metrics = localRules.overrides[overrideKey];
                    return Object.keys(metrics).map(metricKey => (
                      <tr key={`${overrideKey}-${metricKey}`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem" }}>
                          <span className="mono" style={{ color: "var(--accent)" }}>{overrideKey}</span>
                        </td>
                        <td style={{ padding: "0.5rem" }}>{getMetricLabel(metricKey)}</td>
                        <td style={{ padding: "0.5rem" }}>
                          <strong>{metrics[metricKey]}</strong>
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-stop"
                            onClick={() => handleRemoveOverride(overrideKey, metricKey)}
                            style={{ padding: "0.2rem 0.5rem" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Real-time Trigger Preview */}
      <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", height: "fit-content" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h4 style={{ margin: 0 }}>Trigger Preview</h4>
          <span className={`badge ${previewTriggers.length > 0 ? "badge-offline" : ""}`} style={{
            backgroundColor: previewTriggers.length > 0 ? "var(--danger-bg)" : "var(--success-bg)",
            color: previewTriggers.length > 0 ? "var(--danger)" : "var(--success)",
            borderRadius: "12px",
            fontSize: "0.75rem",
            padding: "2px 8px"
          }}>
            {previewTriggers.length} potential alerts
          </span>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 1rem 0", lineHeight: "1.4" }}>
          Live simulation based on current sliders and target overrides against active cluster metrics.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", maxHeight: "600px", paddingRight: "4px" }}>
          {previewTriggers.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8rem", border: "1px dashed var(--border)", borderRadius: "8px" }}>
              🟢 No resources would trigger alerts under these settings.
            </div>
          ) : (
            previewTriggers.map((t, idx) => (
              <div 
                key={idx} 
                className="preview-trigger-card" 
                style={{ 
                  padding: "0.75rem", 
                  background: "rgba(255, 255, 255, 0.02)", 
                  borderLeft: `3px solid ${t.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`, 
                  borderRadius: "0 6px 6px 0",
                  borderTop: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                  <span>{t.cluster}</span>
                  <span style={{ color: t.severity === 'critical' ? 'var(--danger)' : 'var(--warning)', fontWeight: "bold" }}>
                    {t.severity.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: "bold", margin: "0.2rem 0" }}>{t.resource}</div>
                <div style={{ fontSize: "0.75rem", display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                  <span>{t.metric}</span>
                  <span>
                    <strong style={{ color: "var(--text-primary)" }}>{t.value}</strong> &gt; {t.threshold}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
