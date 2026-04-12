import React from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';

export function SummaryCards({ clusters, globalHistory }) {
  // Calcolo aggregati live (per i contatori)
  let runningVMs = 0;
  let totalVMs = 0;
  let runningLXCs = 0;
  let totalLXCs = 0;

  clusters.forEach(cluster => {
    cluster.resources?.forEach(r => {
      if (r.type === 'VM') {
        totalVMs++;
        if (r.status === 'running') runningVMs++;
      }
      if (r.type === 'LXC') {
        totalLXCs++;
        if (r.status === 'running') runningLXCs++;
      }
    });
  });

  return (
    <div className="summary-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="cpuPercent" 
          title="Total CPU Usage" 
          color="#3b82f6" 
        />
      </div>

      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="memPercent" 
          title="Total RAM Usage" 
          color="#8b5cf6" 
        />
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
        <div className="stat-header">Virtual Machines</div>
        <div className="stat-value">{runningVMs} <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>/ {totalVMs}</span></div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active / Total VMs</div>
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div className="stat-header">LXC Containers</div>
        <div className="stat-value">{runningLXCs} <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>/ {totalLXCs}</span></div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active / Total Containers</div>
      </div>
    </div>
  );
}
