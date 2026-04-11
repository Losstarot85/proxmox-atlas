import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export function Sparkline({ data, dataKey, color = "#3b82f6" }) {
  if (!data || data.length === 0) return <span style={{opacity: 0.5}}>-</span>;

  return (
    <div style={{ width: 100, height: 24, display: 'inline-block', verticalAlign: 'middle' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis hide domain={[0, 100]} />
          <Line 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={2} 
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
