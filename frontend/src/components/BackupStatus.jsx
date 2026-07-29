import React, { useState, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ClipboardList, Clock } from 'lucide-react';
import { API_BASE } from "../config";
import { SkeletonTable } from "./Skeletons";
import { useI18n } from "../i18n";
import { EmptyState, Tooltip } from "./EmptyState";
import { useVirtualScroll } from "../hooks/useVirtualScroll";

const BackupRow = React.memo(({ res, getRelativeTimeString, formatTime, formatBytes }) => (
  <tr 
    style={{ 
      borderBottom: "1px solid var(--border)", 
      background: res.isStale ? "rgba(239, 68, 68, 0.02)" : "transparent"
    }}
  >
    <td style={{ padding: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span className={`badge ${res.type === 'VM' ? 'badge-online' : 'badge-offline'}`} style={{ border: "none" }}>
          {res.type}
        </span>
        <span style={{ fontWeight: "600" }}>{res.name}</span>
        <span className="mono-cell" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>({res.vmid})</span>
      </div>
    </td>
    <td style={{ padding: "0.75rem" }}>
      <div style={{ fontSize: "0.9rem" }}>{res.clusterName}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Node: {res.node}</div>
    </td>
    <td style={{ padding: "0.75rem" }}>
      {res.isStale ? (
        <span className="badge" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)", border: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <AlertTriangle size={12} /> Lacking Backup
        </span>
      ) : (
        <span className="badge" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)", border: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <CheckCircle2 size={12} /> Protected
        </span>
      )}
    </td>
    <td style={{ padding: "0.75rem" }}>
      <div style={{ fontWeight: res.isStale ? "600" : "normal", color: res.isStale ? "var(--danger)" : "var(--text-primary)" }}>
        {getRelativeTimeString(res.daysSince)}
      </div>
      {res.lastBackupTime && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          {formatTime(res.lastBackupTime)}
        </div>
      )}
    </td>
    <td style={{ padding: "0.75rem" }}>
      <span className="badge" style={{ background: "rgba(255, 255, 255, 0.05)", border: "none" }}>
        {res.backupsCount} backup{res.backupsCount !== 1 ? "s" : ""}
      </span>
    </td>
    <td style={{ padding: "0.75rem" }}>
      {res.latestBackup ? formatBytes(res.latestBackup.size) : "—"}
    </td>
  </tr>
));


export function BackupStatus({ clusters }) {
  const { t } = useI18n();
  const [backupsData, setBackupsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backupThresholdDays, setBackupThresholdDays] = useState(7);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("atlas-auth-token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/backups`, { headers });
      if (res.ok) {
        const data = await res.json();
        setBackupsData(data.clusters || []);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Failed to fetch backups");
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  // Map cluster name to its backup files list
  const backupFilesByCluster = useMemo(() => {
    const map = {};
    backupsData.forEach((c) => {
      map[c.name] = c.backups || [];
    });
    return map;
  }, [backupsData]);

  // Aggregate stats & resource backup details
  const backupAnalysis = useMemo(() => {
    let totalBackupsCount = 0;
    let totalBackupBytes = 0;
    const resourcesList = [];
    const recentBackupTimeline = [];

    clusters.forEach((cluster) => {
      const backups = backupFilesByCluster[cluster.name] || [];
      totalBackupsCount += backups.length;

      // Group backups by VMID
      const backupsByVmid = {};
      backups.forEach((b) => {
        totalBackupBytes += b.size || 0;

        if (!backupsByVmid[b.vmid]) {
          backupsByVmid[b.vmid] = [];
        }
        backupsByVmid[b.vmid].push(b);

        // Add to timeline
        recentBackupTimeline.push({
          ...b,
          clusterName: cluster.name,
        });
      });

      // Analyze each resource in cluster
      (cluster.resources || []).forEach((res) => {
        const vmid = res.vmid;
        const vmBackups = backupsByVmid[vmid] || [];
        const latestBackup = vmBackups.length > 0 
          ? vmBackups.reduce((latest, current) => (current.ctime > latest.ctime ? current : latest), vmBackups[0]) 
          : null;

        const lastBackupTime = latestBackup ? latestBackup.ctime : null;
        const daysSince = lastBackupTime ? (Date.now() / 1000 - lastBackupTime) / 86400 : null;
        
        // Configurable highlight status
        const isStale = lastBackupTime ? daysSince > backupThresholdDays : true;

        resourcesList.push({
          vmid: res.vmid,
          name: res.name,
          type: res.type,
          node: res.node,
          status: res.status,
          clusterName: cluster.name,
          backupsCount: vmBackups.length,
          lastBackupTime,
          daysSince,
          isStale,
          latestBackup,
        });
      });
    });

    // Sort timeline descending by ctime
    recentBackupTimeline.sort((a, b) => b.ctime - a.ctime);

    return {
      totalBackupsCount,
      totalBackupBytes,
      resources: resourcesList,
      timeline: recentBackupTimeline,
    };
  }, [clusters, backupFilesByCluster, backupThresholdDays]);

  // Filters resources based on search query
  const filteredResources = useMemo(() => {
    return backupAnalysis.resources.filter((r) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(searchLower) ||
        r.vmid.toString().includes(searchLower) ||
        r.node.toLowerCase().includes(searchLower) ||
        r.clusterName.toLowerCase().includes(searchLower)
      );
    });
  }, [backupAnalysis.resources, searchQuery]);

  // Stale (unprotected) resources list
  const staleResources = useMemo(() => {
    return backupAnalysis.resources.filter((r) => r.isStale);
  }, [backupAnalysis.resources]);

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format date helper
  const formatTime = (ts) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleString("sv-SE");
  };

  const getRelativeTimeString = (days) => {
    if (days === null) return "Never";
    if (days < 0.1) return "Just now";
    if (days < 1) {
      const hours = Math.round(days * 24);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    }
    const roundedDays = Math.round(days);
    return `${roundedDays} day${roundedDays > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="backups-tab">
      <div className="network-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h2 style={{ margin: 0 }}>{t('header.backups')}</h2>
          <button className="btn" onClick={fetchBackups} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          {/* Search bar */}
          <input
            type="text"
            className="search-input"
            style={{ width: "250px", margin: 0 }}
            placeholder={t('backup.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search backup resources"
          />

          {/* Configurable N days threshold */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label htmlFor="backup-threshold-select" style={{ fontSize: "0.9rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center" }}>
              Threshold:
              <Tooltip text="Staleness threshold. If a VM or container has not been backed up within this number of days, it is marked as unprotected." />
            </label>
            <select
              id="backup-threshold-select"
              className="search-input"
              style={{ width: "120px", margin: 0, padding: "0.3rem 0.5rem", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              value={backupThresholdDays}
              onChange={(e) => setBackupThresholdDays(parseInt(e.target.value))}
            >
              <option value={1}>1 Day</option>
              <option value={3}>3 Days</option>
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="global-error" style={{ marginBottom: "1.5rem" }}>
          <span><AlertTriangle size={16} /></span>
          <span>{error}</span>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="glass-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{t('backup.all_backups')}</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "var(--accent)" }}>{backupAnalysis.totalBackupsCount}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>vzdump archives found</div>
        </div>

        <div className="glass-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{t('backup.total_size')}</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "var(--success)" }}>{formatBytes(backupAnalysis.totalBackupBytes)}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Aggregate storage usage</div>
        </div>

        <div className="glass-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{t('backup.total_protected')}</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "var(--text-primary)" }}>
            {backupAnalysis.resources.length - staleResources.length} <span style={{ fontSize: "1rem", fontWeight: "normal", color: "var(--text-secondary)" }}>/ {backupAnalysis.resources.length}</span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Backed up in last {backupThresholdDays} days</div>
        </div>

        <div className="glass-card" style={{ padding: "1.25rem", borderLeft: staleResources.length > 0 ? "3px solid var(--danger)" : "none" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{t('backup.total_unprotected')}</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: staleResources.length > 0 ? "var(--danger)" : "var(--success)" }}>
            {staleResources.length}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>No backup in {backupThresholdDays} days</div>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          {/* Unprotected Resources Warning Banner */}
          {staleResources.length > 0 && (
            <div className="glass-card" style={{ padding: "1rem 1.5rem", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", color: "var(--danger)", marginBottom: "0.25rem" }}>
                <span><ShieldAlert size={18} /></span> Action Required: {staleResources.length} resources are lacking recent backups
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                The resources listed below have not been backed up within your configured threshold of {backupThresholdDays} days, or have no backups recorded on Proxmox storage pools.
              </p>
            </div>
          )}

          {/* Details / Matrix Table */}
          <div 
            ref={tableContainerRef}
            className="glass-card" 
            style={{ 
              padding: "1.5rem",
              maxHeight: isVirtual ? "600px" : "auto",
              overflowY: isVirtual ? "auto" : "visible"
            }}
          >
            <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ClipboardList size={18} /> Protection Inventory ({filteredResources.length})
            </h3>
            <table className="cluster-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0.75rem" }}>Resource</th>
                  <th style={{ padding: "0.75rem" }}>Cluster & Node</th>
                  <th style={{ padding: "0.75rem" }}>Backup Status</th>
                  <th style={{ padding: "0.75rem" }}>Last Backup Date</th>
                  <th style={{ padding: "0.75rem" }}>Backups</th>
                  <th style={{ padding: "0.75rem" }}>Latest Size</th>
                </tr>
              </thead>
              <tbody>
                {filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                      No resources match your search query.
                    </td>
                  </tr>
                ) : isVirtual ? (
                  <>
                    {offsetY > 0 && <tr style={{ height: `${offsetY}px` }}><td colSpan={6} /></tr>}
                    {virtualItems.map(({ index }) => {
                      const res = filteredResources[index];
                      return (
                        <BackupRow
                          key={`${res.clusterName}-${res.type}-${res.vmid}`}
                          res={res}
                          getRelativeTimeString={getRelativeTimeString}
                          formatTime={formatTime}
                          formatBytes={formatBytes}
                        />
                      );
                    })}
                    {totalHeight - offsetY - (virtualItems.length * 52) > 0 && (
                      <tr style={{ height: `${Math.max(0, totalHeight - offsetY - (virtualItems.length * 52))}px` }}><td colSpan={6} /></tr>
                    )}
                  </>
                ) : (
                  filteredResources.map((res) => (
                    <BackupRow
                      key={`${res.clusterName}-${res.type}-${res.vmid}`}
                      res={res}
                      getRelativeTimeString={getRelativeTimeString}
                      formatTime={formatTime}
                      formatBytes={formatBytes}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Recent Timeline View */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <h3 style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Clock size={18} /> Recent Backups Timeline
            </h3>
            {backupAnalysis.timeline.length === 0 ? (
              <EmptyState type="backups" />
            ) : (
              <div className="timeline-container" style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative", paddingLeft: "1.5rem" }}>
                {/* Visual timeline line */}
                <div style={{ position: "absolute", left: "6px", top: "8px", bottom: "8px", width: "2px", background: "var(--border)" }}></div>

                {backupAnalysis.timeline.slice(0, 15).map((backup) => (
                  <div key={backup.volid} style={{ position: "relative" }}>
                    {/* Bullet dot */}
                    <div style={{ position: "absolute", left: "-23px", top: "5px", width: "10px", height: "10px", borderRadius: "50%", background: "linear-gradient(135deg, #0d9488, #14b8a6)", border: "2px solid var(--bg-primary)" }}></div>

                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                      <div>
                        <div style={{ fontWeight: "600", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span>vzdump archive</span>
                          <span className="mono-cell" style={{ fontSize: "0.75rem", background: "rgba(255, 255, 255, 0.05)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                            {backup.volid.split("/").pop()}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                          Resource ID: <strong style={{ color: "var(--text-primary)" }}>{backup.vmid}</strong> | Cluster: <strong>{backup.clusterName}</strong> | Node: <strong>{backup.node}</strong> | Storage: <strong>{backup.storage}</strong>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "500", fontSize: "0.9rem" }}>{formatTime(backup.ctime)}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--success)" }}>Size: {formatBytes(backup.size)} ({backup.format})</div>
                      </div>
                    </div>
                  </div>
                ))}
                {backupAnalysis.timeline.length > 15 && (
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontStyle: "italic", marginTop: "0.5rem" }}>
                    Showing top 15 recent backups. {backupAnalysis.timeline.length - 15} more backups are recorded.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
