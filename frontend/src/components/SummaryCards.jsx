import React, { useState, useEffect, useRef } from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';
import { AnimatedCounter } from './AnimatedCounter';
import { classifyNode, classifyResource } from './ClusterHealthBar';
import { useI18n } from '../i18n';

// Inline Sparkline component for rendering history trends
function Sparkline({ data, color = '#3b82f6' }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ width: '70px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>no history</span>
      </div>
    );
  }

  const width = 70;
  const height = 24;
  const pad = 1;
  const drawH = height - pad * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + drawH - ((val - min) / range) * drawH;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', opacity: 0.85 }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function calculateTrend(historyArray, currentValue) {
  if (!historyArray || historyArray.length < 2) return null;
  const compareIndex = Math.max(0, historyArray.length - 11);
  const compareValue = historyArray[compareIndex];
  
  if (compareValue === 0) {
    if (currentValue === 0) return { text: '0.0%', isUp: false, isZero: true };
    return { text: `↑ +${currentValue.toFixed(1)}%`, isUp: true, isZero: false };
  }
  
  const diff = currentValue - compareValue;
  const pct = (diff / compareValue) * 100;
  
  if (Math.abs(pct) < 0.05) {
    return { text: '0.0%', isUp: false, isZero: true };
  }
  
  const isUp = pct > 0;
  const sign = isUp ? '+' : '';
  const text = `${isUp ? '↑' : '↓'} ${sign}${pct.toFixed(1)}%`;
  return { text, isUp, isZero: false };
}

function getTrendColor(trend, type) {
  if (!trend || trend.isZero) return 'var(--text-secondary)';
  if (type === 'health') {
    return trend.isUp ? '#10b981' : '#ef4444'; // Up is good, Down is bad
  }
  if (type === 'alerts' || type === 'storage') {
    return trend.isUp ? '#ef4444' : '#10b981'; // Up is bad, Down is good
  }
  return trend.isUp ? '#10b981' : '#ef4444'; // VM/LXC
}

function formatBytesToSize(bytes) {
  if (!bytes || bytes === 0) return "0 GB";
  const tb = bytes / (1024 ** 4);
  if (tb >= 0.9) {
    return tb.toFixed(2) + " TB";
  }
  const gb = bytes / (1024 ** 3);
  return gb.toFixed(1) + " GB";
}

export const SummaryCards = React.memo(function SummaryCards({ clusters, globalHistory, alerts = [], onNavigateToAlerts }) {

  const { t } = useI18n();
  // Aggregate VMs & LXCs
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

  // Calculate storage sizes
  let totalStorageTotal = 0;
  let totalStorageUsed = 0;
  clusters.forEach(cluster => {
    cluster.nodes?.forEach(n => {
      if (n.status === 'online' && n.storage_pools) {
        n.storage_pools.forEach(sp => {
          if (sp.active === 1) {
            totalStorageTotal += (sp.total || 0);
            totalStorageUsed += (sp.used || 0);
          }
        });
      }
    });
  });
  const storagePercent = totalStorageTotal > 0 ? (totalStorageUsed / totalStorageTotal) * 100 : 0;

  // Calculate Active Alerts Count
  const activeAlertsCount = alerts ? alerts.length : 0;

  // Calculate Health Score
  let healthScore = 100;
  let offlineNodesCount = 0;
  let criticalCount = 0;
  let warningCount = 0;

  clusters.forEach(cluster => {
    cluster.nodes?.forEach(n => {
      const tier = classifyNode(n);
      if (tier === 'offline') offlineNodesCount++;
      else if (tier === 'critical') criticalCount++;
      else if (tier === 'warning') warningCount++;
    });
    cluster.resources?.forEach(r => {
      const tier = classifyResource(r);
      if (tier === 'critical') criticalCount++;
      else if (tier === 'warning') warningCount++;
    });
  });

  healthScore -= (offlineNodesCount * 15);
  healthScore -= (criticalCount * 5);
  healthScore -= (warningCount * 2);
  healthScore -= (alerts ? alerts.filter(a => a.severity === 'critical').length : 0) * 2;
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Local metric histories
  const [healthHistory, setHealthHistory] = useState([]);
  const [storageHistory, setStorageHistory] = useState([]);
  const [vmHistory, setVmHistory] = useState([]);
  const [lxcHistory, setLxcHistory] = useState([]);
  const [alertsHistory, setAlertsHistory] = useState([]);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (clusters.length === 0) return;

    if (!hasInitializedRef.current) {
      setHealthHistory(Array(12).fill(healthScore));
      setStorageHistory(Array(12).fill(storagePercent));
      setVmHistory(Array(12).fill(runningVMs));
      setLxcHistory(Array(12).fill(runningLXCs));
      setAlertsHistory(Array(12).fill(activeAlertsCount));
      hasInitializedRef.current = true;
    } else {
      setHealthHistory(prev => {
        const next = [...prev, healthScore];
        if (next.length > 40) next.shift();
        return next;
      });
      setStorageHistory(prev => {
        const next = [...prev, storagePercent];
        if (next.length > 40) next.shift();
        return next;
      });
      setVmHistory(prev => {
        const next = [...prev, runningVMs];
        if (next.length > 40) next.shift();
        return next;
      });
      setLxcHistory(prev => {
        const next = [...prev, runningLXCs];
        if (next.length > 40) next.shift();
        return next;
      });
      setAlertsHistory(prev => {
        const next = [...prev, activeAlertsCount];
        if (next.length > 40) next.shift();
        return next;
      });
    }
  }, [clusters, alerts, healthScore, storagePercent, runningVMs, runningLXCs, activeAlertsCount]);

  // Compute trends
  const healthTrend = calculateTrend(healthHistory, healthScore);
  const storageTrend = calculateTrend(storageHistory, storagePercent);
  const vmTrend = calculateTrend(vmHistory, runningVMs);
  const lxcTrend = calculateTrend(lxcHistory, runningLXCs);
  const alertsTrend = calculateTrend(alertsHistory, activeAlertsCount);

  // Border Colors
  const healthColor = healthScore > 85 ? '#10b981' : healthScore > 70 ? '#f59e0b' : '#ef4444';
  const storageColor = storagePercent > 85 ? '#ef4444' : storagePercent > 70 ? '#f59e0b' : '#3b82f6';
  const alertsColor = activeAlertsCount > 0 ? '#ef4444' : '#10b981';
  const vmColor = '#10b981';
  const lxcColor = '#f59e0b';

  return (
    <div className="summary-container">
      {/* CPU Usage Card */}
      <div className="glass-card stat-card stat-card-wide" style={{ padding: '1rem', display: 'flex', '--card-delay': '0s' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="cpuPercent" 
          title={t('summary.total_cpu')} 
          color="#3b82f6" 
        />
      </div>

      {/* RAM Usage Card */}
      <div className="glass-card stat-card stat-card-wide" style={{ padding: '1rem', display: 'flex', '--card-delay': '0.06s' }}>
        <TimeSeriesChart 
          data={globalHistory || []} 
          dataKey="memPercent" 
          title={t('summary.total_ram')} 
          color="#8b5cf6" 
        />
      </div>

      {/* Cluster Health Score Card */}
      <div className="glass-card stat-card stat-card-standard" style={{ borderLeft: `4px solid ${healthColor}`, '--card-delay': '0.12s', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🛡️</span>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('health.healthy')}</span>
          </div>
          {healthTrend && (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getTrendColor(healthTrend, 'health') }} title="vs previous period">
              {healthTrend.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <div>
            <div className="stat-value" style={{ margin: 0, fontSize: '2.2rem' }}>
              <AnimatedCounter value={healthScore} />%
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Infrastructure Score
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Sparkline data={healthHistory} color={healthColor} />
          </div>
        </div>
      </div>

      {/* Total Storage Card */}
      <div className="glass-card stat-card stat-card-standard" style={{ borderLeft: `4px solid ${storageColor}`, '--card-delay': '0.18s', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>💾</span>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('resource.disk')}</span>
          </div>
          {storageTrend && (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getTrendColor(storageTrend, 'storage') }} title="vs previous period">
              {storageTrend.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <div>
            <div className="stat-value" style={{ margin: 0, fontSize: '2.2rem' }}>
              <AnimatedCounter value={Math.round(storagePercent)} />%
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {formatBytesToSize(totalStorageUsed)} / {formatBytesToSize(totalStorageTotal)} Used
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Sparkline data={storageHistory} color={storageColor} />
          </div>
        </div>
      </div>

      {/* Virtual Machines Card */}
      <div className="glass-card stat-card stat-card-standard" style={{ borderLeft: `4px solid ${vmColor}`, '--card-delay': '0.24s', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🖥️</span>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('summary.total_vms')}</span>
          </div>
          {vmTrend && (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getTrendColor(vmTrend, 'vm') }} title="vs previous period">
              {vmTrend.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <div>
            <div className="stat-value" style={{ margin: 0, fontSize: '2.2rem' }}>
              <AnimatedCounter value={runningVMs} />
              <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}> / <AnimatedCounter value={totalVMs} /></span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Active / Total VMs
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Sparkline data={vmHistory} color={vmColor} />
          </div>
        </div>
      </div>

      {/* LXC Containers Card */}
      <div className="glass-card stat-card stat-card-standard" style={{ borderLeft: `4px solid ${lxcColor}`, '--card-delay': '0.3s', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📦</span>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('cluster.containers')}</span>
          </div>
          {lxcTrend && (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getTrendColor(lxcTrend, 'lxc') }} title="vs previous period">
              {lxcTrend.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <div>
            <div className="stat-value" style={{ margin: 0, fontSize: '2.2rem' }}>
              <AnimatedCounter value={runningLXCs} />
              <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}> / <AnimatedCounter value={totalLXCs} /></span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Active / Total Containers
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Sparkline data={lxcHistory} color={lxcColor} />
          </div>
        </div>
      </div>

      {/* Active Alerts Count Card */}
      <div 
        className="glass-card stat-card stat-card-standard" 
        onClick={onNavigateToAlerts}
        style={{ 
          borderLeft: `4px solid ${alertsColor}`, 
          '--card-delay': '0.36s', 
          padding: '1.25rem', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between', 
          minHeight: '120px',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🚨</span>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('summary.active_alerts')}</span>
          </div>
          {alertsTrend && (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getTrendColor(alertsTrend, 'alerts') }} title="vs previous period">
              {alertsTrend.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <div>
            <div className="stat-value" style={{ margin: 0, fontSize: '2.2rem' }}>
              <AnimatedCounter value={activeAlertsCount} />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              System Notifications Center
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Sparkline data={alertsHistory} color={alertsColor} />
          </div>
        </div>
      </div>
    </div>
  );
});

