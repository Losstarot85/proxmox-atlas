import React from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';

export function SummaryCards({ clusters, history }) {
  // Calcolo aggregati live (per i contatori)
  let runningVMs = 0;
  let runningLXCs = 0;

  clusters.forEach(cluster => {
    cluster.resources?.forEach(r => {
      if (r.status === 'running') {
        if (r.type === 'VM') runningVMs++;
        if (r.type === 'LXC') runningLXCs++;
      }
    });
  });

  // Costruiamo i dati aggregati per la history
  const historyData = history?.map(h => {
    let tCpu = 0, mCpu = 0, tMem = 0, mMem = 0;
    h.clusters.forEach(c => {
       c.nodes?.forEach(n => {
         if (n.status === 'online') {
            tCpu += (n.cpu || 0) * n.maxcpu;
            mCpu += n.maxcpu;
            tMem += (n.mem || 0);
            mMem += (n.maxmem || 0);
         }
       });
    });
    
    return {
      timestamp: h.timestamp,
      cpuPercent: mCpu > 0 ? Number(((tCpu / mCpu) * 100).toFixed(1)) : 0,
      memPercent: mMem > 0 ? Number(((tMem / mMem) * 100).toFixed(1)) : 0
    };
  }) || [];

  return (
    <div className="summary-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2' }}>
        <TimeSeriesChart 
          data={historyData} 
          dataKey="cpuPercent" 
          title="Total CPU Usage" 
          color="#3b82f6" 
        />
      </div>

      <div className="glass-card stat-card" style={{ padding: '1rem', display: 'flex', gridColumn: 'span 2' }}>
        <TimeSeriesChart 
          data={historyData} 
          dataKey="memPercent" 
          title="Total RAM Usage" 
          color="#8b5cf6" 
        />
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
