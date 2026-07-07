import React, { useState, useMemo } from "react";

export function AlertTimeline({ 
  alerts, 
  handleSilence, 
  handleMarkRead, 
  handleDelete 
}) {
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterCluster, setFilterCluster] = useState("all");
  const [filterNode, setFilterNode] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterTimeRange, setFilterTimeRange] = useState("all"); // all, 1h, 24h, 7d, 30d
  const [expandedAlerts, setExpandedAlerts] = useState({});

  const toggleExpand = (id) => {
    setExpandedAlerts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Determine resource type from resource string
  const getResourceType = (resourceStr) => {
    if (!resourceStr) return "NODE";
    const str = resourceStr.toUpperCase();
    if (str.startsWith("VM")) return "VM";
    if (str.startsWith("LXC")) return "LXC";
    return "NODE";
  };

  // Extract unique clusters and nodes for filter dropdowns
  const uniqueClusters = useMemo(() => {
    const set = new Set(alerts.map(a => a.cluster).filter(Boolean));
    return Array.from(set).sort();
  }, [alerts]);

  const uniqueNodes = useMemo(() => {
    const set = new Set(alerts.map(a => a.node).filter(Boolean));
    return Array.from(set).sort();
  }, [alerts]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    const nowSecs = Date.now() / 1000;
    
    return alerts.filter(alert => {
      // 1. Time range filter
      if (filterTimeRange !== "all") {
        const ageSecs = nowSecs - alert.timestamp;
        if (filterTimeRange === "1h" && ageSecs > 3600) return false;
        if (filterTimeRange === "24h" && ageSecs > 86400) return false;
        if (filterTimeRange === "7d" && ageSecs > 604800) return false;
        if (filterTimeRange === "30d" && ageSecs > 2592000) return false;
      }

      // 2. Severity filter
      if (filterSeverity !== "all" && alert.severity !== filterSeverity) {
        return false;
      }

      // 3. Cluster filter
      if (filterCluster !== "all" && alert.cluster !== filterCluster) {
        return false;
      }

      // 4. Node filter
      if (filterNode !== "all" && alert.node !== filterNode) {
        return false;
      }

      // 5. Resource Type filter
      if (filterType !== "all") {
        const type = getResourceType(alert.resource);
        if (filterType !== type) return false;
      }

      // 6. Search query filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const msg = (alert.message || "").toLowerCase();
        const cluster = (alert.cluster || "").toLowerCase();
        const node = (alert.node || "").toLowerCase();
        const res = (alert.resource || "").toLowerCase();
        return msg.includes(q) || cluster.includes(q) || node.includes(q) || res.includes(q);
      }

      return true;
    });
  }, [alerts, filterTimeRange, filterSeverity, filterCluster, filterNode, filterType, search]);

  // Group filtered alerts by day (e.g. "Tuesday, July 7, 2026")
  const groupedAlerts = useMemo(() => {
    const groups = {};
    
    filteredAlerts.forEach(alert => {
      const dateStr = new Date(alert.timestamp * 1000).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(alert);
    });
    
    return groups;
  }, [filteredAlerts]);

  const formatTime = (ts) => {
    return new Date(ts * 1000).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="alert-timeline-view">
      {/* Interactive Toolbar Filters */}
      <div className="timeline-toolbar glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search alerts (message, node, cluster...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {search && (
              <button 
                onClick={() => setSearch("")} 
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
          
          <button 
            className="btn btn-small"
            onClick={() => {
              setSearch("");
              setFilterSeverity("all");
              setFilterCluster("all");
              setFilterNode("all");
              setFilterType("all");
              setFilterTimeRange("all");
            }}
          >
            Reset Filters
          </button>
        </div>

        <div className="filter-dropdowns-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Time Range */}
          <div className="filter-select-group">
            <label>Time</label>
            <select value={filterTimeRange} onChange={(e) => setFilterTimeRange(e.target.value)} className="select-control">
              <option value="all">All Time</option>
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Severity */}
          <div className="filter-select-group">
            <label>Severity</label>
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="select-control">
              <option value="all">All Severities</option>
              <option value="critical">🚨 Critical</option>
              <option value="warning">⚠️ Warning</option>
            </select>
          </div>

          {/* Cluster */}
          <div className="filter-select-group">
            <label>Cluster</label>
            <select value={filterCluster} onChange={(e) => setFilterCluster(e.target.value)} className="select-control">
              <option value="all">All Clusters</option>
              {uniqueClusters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Node */}
          <div className="filter-select-group">
            <label>Node</label>
            <select value={filterNode} onChange={(e) => setFilterNode(e.target.value)} className="select-control">
              <option value="all">All Nodes</option>
              {uniqueNodes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Resource Type */}
          <div className="filter-select-group">
            <label>Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select-control">
              <option value="all">All Types</option>
              <option value="VM">Virtual Machine</option>
              <option value="LXC">LXC Container</option>
              <option value="NODE">Physical Node</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline List */}
      {filteredAlerts.length === 0 ? (
        <div className="empty-state glass-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>🔍</span>
          No alerts match the selected filter criteria.
        </div>
      ) : (
        <div className="timeline-container">
          {Object.keys(groupedAlerts).map(dateStr => (
            <div key={dateStr} className="timeline-group">
              {/* Day Header Banner */}
              <div className="timeline-date-header">
                <span>📅 {dateStr}</span>
                <span className="timeline-count-badge">{groupedAlerts[dateStr].length} alerts</span>
              </div>

              <div className="timeline-group-items">
                {groupedAlerts[dateStr].map(alert => {
                  const isExpanded = !!expandedAlerts[alert.id];
                  const type = getResourceType(alert.resource);

                  return (
                    <div 
                      key={alert.id}
                      className={`timeline-item ${isExpanded ? 'expanded' : ''} ${!alert.read ? 'unread' : ''}`}
                      onClick={() => toggleExpand(alert.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Left Dot Axis */}
                      <div className="timeline-axis-connector">
                        <span 
                          className={`timeline-dot ${alert.severity === 'critical' ? 'critical' : 'warning'}`}
                          title={alert.severity.toUpperCase()}
                        />
                      </div>

                      {/* Content Card */}
                      <div className="timeline-item-card glass-card">
                        <div className="timeline-item-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <span className="timeline-time">{formatTime(alert.timestamp)}</span>
                            
                            <span className={`badge ${alert.severity === 'critical' ? 'badge-offline' : ''}`} style={{
                              backgroundColor: alert.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                              color: alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                              border: 'none',
                              fontSize: '0.65rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700
                            }}>
                              {alert.severity.toUpperCase()}
                            </span>
                            
                            <div className="timeline-meta-chips">
                              <span className="timeline-chip cluster-chip" title="Cluster">{alert.cluster}</span>
                              <span className="timeline-chip node-chip" title="Node">{alert.node}</span>
                              <span className="timeline-chip resource-chip" title="Resource">
                                {type === "VM" ? "🖥️ " : type === "LXC" ? "📦 " : "📍 "}
                                {alert.resource}
                              </span>
                            </div>
                          </div>

                          <span className="expand-chevron">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>

                        <div className="timeline-message" style={{ fontSize: '0.95rem', fontWeight: alert.read ? 400 : 600, color: 'var(--text-primary)', marginTop: '0.5rem', lineHeight: '1.5' }}>
                          {alert.message}
                        </div>

                        {/* Expanded details & quick actions */}
                        {isExpanded && (
                          <div className="timeline-expanded-details" onClick={(e) => e.stopPropagation()}>
                            <div className="timeline-info-grid">
                              <div className="timeline-info-item">
                                <span className="label">Timestamp</span>
                                <span className="value">{new Date(alert.timestamp * 1000).toLocaleString()}</span>
                              </div>
                              <div className="timeline-info-item">
                                <span className="label">Alert ID</span>
                                <span className="value mono">{alert.id}</span>
                              </div>
                              <div className="timeline-info-item">
                                <span className="label">Resource Type</span>
                                <span className="value">{type}</span>
                              </div>
                              <div className="timeline-info-item">
                                <span className="label">Read Status</span>
                                <span className="value">{alert.read ? "Read" : "Unread"}</span>
                              </div>
                            </div>

                            <div className="timeline-actions-row">
                              <button 
                                className="btn btn-sm"
                                onClick={() => handleSilence(alert.id)}
                              >
                                🔕 Silence 1h
                              </button>
                              
                              {!alert.read && (
                                <button 
                                  className="btn btn-sm"
                                  onClick={() => handleMarkRead(alert.id)}
                                >
                                  👁️ Mark Read
                                </button>
                              )}

                              <button 
                                className="btn btn-sm btn-stop"
                                onClick={() => handleDelete(alert.id)}
                              >
                                🗑️ Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
