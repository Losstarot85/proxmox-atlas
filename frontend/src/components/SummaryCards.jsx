import React from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';
import { AnimatedCounter } from './AnimatedCounter';
import { RadialGauge } from './RadialGauge';

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

  // Latest global CPU/RAM for gauges
  const latest = globalHistory?.length > 0 ? globalHistory[globalHistory.length - 1] : null;
  const cpuPct = latest?.cpuPercent ?? 0;
  const ramPct = latest?.memPercent ?? 0;

  return (
    <div className="summary-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2', '--card-delay': '0s' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="cpuPercent" 
          title="Total CPU Usage" 
          color="#3b82f6" 
        />
      </div>

      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2', '--card-delay': '0.06s' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="memPercent" 
          title="Total RAM Usage" 
          color="#8b5cf6" 
        />
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981', '--card-delay': '0.12s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <RadialGauge
            value={runningVMs}
            max={totalVMs || 1}
            label=""
            size="sm"
            color="#10b981"
            displayValue={`${totalVMs > 0 ? ((runningVMs / totalVMs) * 100).toFixed(0) : 0}%`}
          />
          <div>
            <div className="stat-header">Virtual Machines</div>
            <div className="stat-value"><AnimatedCounter value={runningVMs} /> <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>/ <AnimatedCounter value={totalVMs} /></span></div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active / Total VMs</div>
          </div>
        </div>
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b', '--card-delay': '0.18s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <RadialGauge
            value={runningLXCs}
            max={totalLXCs || 1}
            label=""
            size="sm"
            color="#f59e0b"
            displayValue={`${totalLXCs > 0 ? ((runningLXCs / totalLXCs) * 100).toFixed(0) : 0}%`}
          />
          <div>
            <div className="stat-header">LXC Containers</div>
            <div className="stat-value"><AnimatedCounter value={runningLXCs} /> <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>/ <AnimatedCounter value={totalLXCs} /></span></div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active / Total Containers</div>
          </div>
        </div>
      </div>
    </div>
  );
}
