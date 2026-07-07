import React from "react";
import { useAlerts, useDismissAlert, useMarkAlertRead, useSilenceAlert, useClearAllAlerts } from "../hooks/useApiQueries";
import { SkeletonAlerts } from "./Skeletons";
import { AlertTimeline } from "./AlertTimeline";

function SwipeableAlertCard({ alert, formatTime, handleSilence, handleMarkRead, handleDelete }) {
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [currentTranslateX, setCurrentTranslateX] = React.useState(0);
  const [isSwiping, setIsSwiping] = React.useState(false);

  const handleTouchStart = (e) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping) return;
    const currentX = e.targetTouches[0].clientX;
    const diffX = currentX - touchStartX;
    setCurrentTranslateX(diffX);
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (Math.abs(currentTranslateX) > 120) {
      setCurrentTranslateX(currentTranslateX > 0 ? 500 : -500);
      setTimeout(() => {
        handleDelete(alert.id);
      }, 150);
    } else {
      setCurrentTranslateX(0);
    }
  };

  const transformStyle = currentTranslateX !== 0 
    ? `translateX(${currentTranslateX}px)` 
    : 'none';
  const opacityStyle = currentTranslateX !== 0 
    ? Math.max(0.2, 1 - Math.abs(currentTranslateX) / 300) 
    : (alert.read ? 0.7 : 1);

  return (
    <div 
      className={`glass-card alert-card alert-card-swipeable ${!alert.read ? 'unread' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        borderLeft: `4px solid ${alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`,
        transform: transformStyle,
        opacity: opacityStyle,
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <div className="alert-content">
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap'}}>
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
        <div style={{fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.6}}>{alert.message}</div>
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
  );
}

export function AlertsTab() {
  const { data, isLoading: loading } = useAlerts();
  const alerts = data?.alerts || [];
  const [viewMode, setViewMode] = React.useState("timeline");

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
         <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <h2 style={{margin: 0}}>Notification Center</h2>
            <div className="filter-group" style={{ margin: 0, display: 'flex', gap: '2px' }}>
              <button 
                type="button" 
                className={`filter-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                onClick={() => setViewMode('timeline')}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                🕒 Timeline
              </button>
              <button 
                type="button" 
                className={`filter-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                📱 Swipe List
              </button>
            </div>
         </div>
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
      ) : viewMode === "timeline" ? (
        <AlertTimeline 
          alerts={alerts}
          handleSilence={handleSilence}
          handleMarkRead={handleMarkRead}
          handleDelete={handleDelete}
        />
      ) : (
        <div className="alerts-list" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          {alerts.map(alert => (
            <SwipeableAlertCard 
              key={alert.id}
              alert={alert}
              formatTime={formatTime}
              handleSilence={handleSilence}
              handleMarkRead={handleMarkRead}
              handleDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

