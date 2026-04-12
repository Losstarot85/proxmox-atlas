import React, { memo } from 'react';

// Pure raw SVG implementation to skip heavy Recharts/D3 node overhead
export const Sparkline = memo(({ data, color = "#3b82f6" }) => {
  if (!data || data.length === 0) return <span style={{opacity: 0.5}}>-</span>;

  const width = 100;
  const height = 24;
  const maxDataPnts = 40;
  
  // Calculate points for the SVG polyline mapped 0-100 to height
  const points = data.map((val, i) => {
    // x distributed along the width
    const x = (i / (maxDataPnts - 1)) * width;
    // y mapped inversely (0% = bottom, 100% = top)
    const y = height - (Math.min(Math.max(val || 0, 0), 100) / 100) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ width: width, height: height, display: 'inline-block', verticalAlign: 'middle' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
});
