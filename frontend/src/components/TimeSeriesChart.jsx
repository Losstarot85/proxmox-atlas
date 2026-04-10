import React, { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function TimeSeriesChart({ data, dataKey, color = "#3b82f6", title, valueFormatter }) {
  const chartId = useId();
  if (!data || data.length === 0) return <div className="loading-view" style={{height: 120}}>No data</div>;

  return (
    <div className="time-series-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      <div className="ts-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span className="ts-title" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{title}</span>
        <span className="ts-current" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
          {valueFormatter ? valueFormatter(data[data.length - 1][dataKey]) : `${data[data.length - 1][dataKey]}%`}
        </span>
      </div>
      <div style={{ width: '100%', flex: 1, minHeight: 80 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.5}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="timestamp" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(15, 15, 20, 0.95)', 
                borderColor: color, 
                borderWidth: '1px',
                color: '#ececec', 
                borderRadius: '8px',
                boxShadow: `0 4px 15px ${color}33`
              }}
              itemStyle={{ color: color, fontWeight: 'bold', fontSize: '1.1rem' }}
              formatter={(val) => valueFormatter ? valueFormatter(val) : `${val}%`}
              labelStyle={{ color: '#a0a0a0', fontSize: '0.85rem', marginBottom: '4px' }}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#gradient-${chartId})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
