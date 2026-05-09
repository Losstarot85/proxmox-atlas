import React from "react";
import { useAlerts, useDismissAlert, useMarkAlertRead, useSilenceAlert, useClearAllAlerts } from "../hooks/useApiQueries";
import { SkeletonAlerts } from "./Skeletons";

export function AlertsTab() {
  const { data, isLoading: loading } = useAlerts();
  const alerts = data?.alerts || [];

  const dismissMutation = useDismissAlert();
  const markReadMutation = useMarkAlertRead();
  const silenceMutation = useSilenceAlert();
  const clearAllMutation = useClearAllAlerts();

  const handleMarkRead = (id) => markReadMutation.mutate(id);
  const handleSilence = (id) => silenceMutation.mutate({ alertId: id });
  const handleDelete = (id) => dismissMutation.mutate(id);
  const handleClearAll = () => clearAllMutation.mutate();

  const formatTime = (ts) => {
    return new Date(ts * 1000).toLocaleString("sv-SE");
  };

  return (
    <div className="alerts-tab">
      <div className="network-toolbar">
         <h2 style={{margin: 0}}>Notification Center</h2>
         <button className="btn" onClick={handleClearAll} disabled={alerts.length === 0}>
           Clear All
         </button>
      </div>

      {loading ? (
        <SkeletonAlerts count={4} />
      ) : alerts.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "4rem" }}>
          <span style={{fontSize: "3rem", display: "block", marginBottom: "1rem"}}>✅</span>
          All good! No active alerts.
        </div>
      ) : (
        <div className="alerts-list" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          {alerts.map(alert => (
            <div 
              key={alert.id} 
              className={`glass-card alert-card ${!alert.read ? 'unread' : ''}`}
              style={{
                borderLeft: `4px solid ${alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`,
                opacity: alert.read ? 0.7 : 1,
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div className="alert-content">
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem'}}>
                  <span className={`badge ${alert.severity === 'critical' ? 'badge-offline' : ''}`} style={{
                    backgroundColor: alert.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                    color: alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                    border: 'none'
                  }}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>{formatTime(alert.timestamp)}</span>
                  <span className="mono-cell" style={{fontSize: '0.85rem'}}>— {alert.cluster} &gt; {alert.node} &gt; {alert.resource}</span>
                </div>
                <div style={{fontSize: '1.05rem', fontWeight: 500}}>{alert.message}</div>
              </div>
              
              <div className="alert-actions" style={{display: 'flex', gap: '0.5rem'}}>
                <button className="btn" style={{padding: '0.5rem 1rem'}} onClick={() => handleSilence(alert.id)}>
                  🔕 Silence 1h
                </button>
                {!alert.read && (
                  <button className="btn" style={{padding: '0.5rem 1rem'}} onClick={() => handleMarkRead(alert.id)}>
                    Mark Read
                  </button>
                )}
                <button className="btn" style={{padding: '0.5rem 1rem'}} onClick={() => handleDelete(alert.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
