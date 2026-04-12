import React, { useId, useRef } from 'react';

// Pure SVG chart with gradient area fill — replaces heavyweight Recharts AreaChart
export const TimeSeriesChart = ({ data, dataKey, color = "#3b82f6", title, valueFormatter }) => {
  const chartId = useId();
  const svgRef = useRef(null);

  if (!data || data.length === 0) return <div className="loading-view" style={{height: 120}}>No data</div>;

  const width = 500;
  const height = 80;
  const padTop = 4;
  const padBottom = 4;
  const drawH = height - padTop - padBottom;

  const values = data.map(d => d[dataKey] ?? 0);
  const maxVal = Math.max(100, ...values); // At least 100 for percentage
  const currentVal = values[values.length - 1];
  const displayVal = valueFormatter ? valueFormatter(currentVal) : `${currentVal}%`;

  // Build polyline points
  const pts = values.map((val, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = padTop + drawH - (Math.min(Math.max(val, 0), maxVal) / maxVal) * drawH;
    return `${x},${y}`;
  });
  const polylinePoints = pts.join(" ");

  // Build closed polygon for the gradient fill area
  const polygonPoints = `0,${height} ${pts.join(" ")} ${width},${height}`;

  return (
    <div className="time-series-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      <div className="ts-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span className="ts-title" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{title}</span>
        <span className="ts-current" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
          {displayVal}
        </span>
      </div>
      <div style={{ width: '100%', flex: 1, minHeight: 80 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id={`tsc-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(frac => (
            <line
              key={frac}
              x1={0} x2={width}
              y1={padTop + drawH * (1 - frac)} y2={padTop + drawH * (1 - frac)}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="4 4"
            />
          ))}
          {/* Area fill */}
          <polygon
            points={polygonPoints}
            fill={`url(#tsc-grad-${chartId})`}
          />
          {/* Line */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        </svg>
      </div>
    </div>
  );
};
