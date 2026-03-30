import React from 'react';

export function SummaryCards({ clusters }) {
  // Calcolo aggregati
  let totalCpu = 0;
  let maxCpu = 0;
  let totalMem = 0;
  let maxMem = 0;
  let runningVMs = 0;
  let runningLXCs = 0;

  clusters.forEach(cluster => {
    cluster.nodes?.forEach(n => {
      if (n.status === 'online') {
        totalCpu += (n.cpu || 0) * n.maxcpu;
        maxCpu += n.maxcpu;
        totalMem += (n.mem || 0);
        maxMem += (n.maxmem || 0);
      }
    });

    cluster.resources?.forEach(r => {
      if (r.status === 'running') {
        if (r.type === 'VM') runningVMs++;
        if (r.type === 'LXC') runningLXCs++;
      }
    });
  });

  const cpuPercent = maxCpu > 0 ? ((totalCpu / maxCpu) * 100).toFixed(1) : 0;
  const memPercent = maxMem > 0 ? ((totalMem / maxMem) * 100).toFixed(1) : 0;

  return (
    <div className="summary-container">
      <div className="glass-card stat-card">
        <div className="stat-header">Total CPU Usage</div>
        <div className="stat-value">{cpuPercent}%</div>
        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${cpuPercent}%` }}></div>
        </div>
      </div>

      <div className="glass-card stat-card">
        <div className="stat-header">Total RAM Usage</div>
        <div className="stat-value">{memPercent}%</div>
        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${memPercent}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)' }}></div>
        </div>
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
        <div className="stat-header">Running VMs</div>
        <div className="stat-value">{runningVMs}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active Virtual Machines</div>
      </div>

      <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div className="stat-header">Running LXC</div>
        <div className="stat-value">{runningLXCs}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active Containers</div>
      </div>
    </div>
  );
}
