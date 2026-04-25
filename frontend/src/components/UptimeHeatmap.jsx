import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { API_BASE } from "../config";

export function UptimeHeatmap({ target }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    let active = true;

    const fetchUptime = async () => {
      try {
        setLoading(true);
        const nameParam = target.name ? `&target_name=${encodeURIComponent(target.name)}` : '';
        const res = await fetch(`${API_BASE}/time-machine/uptime?target_id=${encodeURIComponent(target.id)}&target_type=${encodeURIComponent(target.type)}&days=30${nameParam}`);
        if (!res.ok) {
          throw new Error("Unable to retrieve historical data: " + res.statusText);
        }
        const json = await res.json();
        if (active) {
          setData(json.results || []);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (target && target.id) {
      fetchUptime();
    }

    return () => {
      active = false;
    };
  }, [target]);

  const cols = 60;
  const rows = 12;

  // Pre-index data into hourly buckets O(N) instead of fuzzy search O(N×M)
  const bucketMap = useMemo(() => {
    const map = new Map();
    data.forEach(d => {
      const bucket = Math.round(d.time / 3600) * 3600;
      map.set(bucket, d.up);
    });
    return map;
  }, [data]);

  // Build grid data once
  const grid = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const currentHour = now - (now % 3600);
    const cells = [];

    for (let c = cols - 1; c >= 0; c--) {
      const colCells = [];
      for (let r = 0; r < rows; r++) {
        const hoursAgo = c * rows + ((rows - 1) - r);
        const cellTime = currentHour - (hoursAgo * 3600);
        const bucket = Math.round(cellTime / 3600) * 3600;

        let status = "nodata";
        if (bucketMap.has(bucket)) {
          status = bucketMap.get(bucket) ? "up" : "down";
        }

        colCells.push({ time: cellTime, status });
      }
      cells.push(colCells);
    }
    return cells;
  }, [bucketMap]);

  // Canvas rendering — single bitmap instead of 720 DOM nodes
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || grid.length === 0) return;

    const container = canvas.parentElement;
    const totalWidth = container.clientWidth;
    const gap = 2;
    const cellW = Math.max(2, (totalWidth - (cols - 1) * gap) / cols);
    const cellH = cellW; // Square aspect ratio
    const totalHeight = rows * cellH + (rows - 1) * gap;

    // Set canvas size for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, totalHeight);

    // Read CSS custom properties for theme awareness
    const cs = getComputedStyle(document.documentElement);
    const colorUp = cs.getPropertyValue("--success").trim() || "#22c55e";
    const colorDown = cs.getPropertyValue("--danger").trim() || "#ef4444";
    const colorNodata = cs.getPropertyValue("--surface-hover").trim() || "#2a2a2e";

    for (let c = 0; c < grid.length; c++) {
      for (let r = 0; r < grid[c].length; r++) {
        const cell = grid[c][r];
        const x = c * (cellW + gap);
        const y = r * (cellH + gap);

        if (cell.status === "up") {
          ctx.fillStyle = colorUp;
          ctx.globalAlpha = 1;
        } else if (cell.status === "down") {
          ctx.fillStyle = colorDown;
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = colorNodata;
          ctx.globalAlpha = 0.3;
        }

        // Rounded rect
        const radius = 2;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cellW - radius, y);
        ctx.arcTo(x + cellW, y, x + cellW, y + radius, radius);
        ctx.lineTo(x + cellW, y + cellH - radius);
        ctx.arcTo(x + cellW, y + cellH, x + cellW - radius, y + cellH, radius);
        ctx.lineTo(x + radius, y + cellH);
        ctx.arcTo(x, y + cellH, x, y + cellH - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [grid]);

  useEffect(() => {
    drawCanvas();
    window.addEventListener("resize", drawCanvas);
    return () => window.removeEventListener("resize", drawCanvas);
  }, [drawCanvas]);

  // Tooltip on mousemove
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip || grid.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const totalWidth = canvas.clientWidth;
    const gap = 2;
    const cellW = Math.max(2, (totalWidth - (cols - 1) * gap) / cols);
    const cellH = cellW;

    const c = Math.floor(mx / (cellW + gap));
    const r = Math.floor(my / (cellH + gap));

    if (c >= 0 && c < grid.length && r >= 0 && r < grid[c].length) {
      const cell = grid[c][r];
      const d = new Date(cell.time * 1000);
      tooltip.textContent = `${d.toLocaleString("sv-SE")} — ${cell.status.toUpperCase()}`;
      tooltip.style.opacity = "1";
      const tooltipWidth = tooltip.offsetWidth || 150;
      if (mx + tooltipWidth + 20 > totalWidth) {
        tooltip.style.left = `${mx - tooltipWidth - 10}px`;
      } else {
        tooltip.style.left = `${mx + 10}px`;
      }
      tooltip.style.top = `${my - 20}px`;
    } else {
      tooltip.style.opacity = "0";
    }
  }, [grid]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
  }, []);

  if (loading) {
     return <div style={{ fontSize: '0.85rem', color: "var(--text-secondary)", padding: "1rem" }}>Loading Availability Heatmap...</div>;
  }

  if (error) {
     return <div style={{ fontSize: '0.85rem', color: "var(--danger)", padding: "1rem" }}>{error}</div>;
  }

  if (data.length === 0) {
    return <div style={{ fontSize: '0.85rem', color: "var(--text-secondary)", padding: "1rem" }}>No historical uptime data from Prometheus for this target in the last 30 days.</div>;
  }

  return (
    <div className="uptime-heatmap-container" style={{
      marginTop: '1.5rem',
      paddingTop: '1rem',
      borderTop: '1px solid var(--border)',
    }}>
      <h4 style={{ marginBottom: "0.5rem", fontSize: "0.95rem", color: "var(--text-secondary)" }}>Reliability Status (30 Days)</h4>
      
      <div style={{ position: 'relative', width: '100%', paddingBottom: '0.5rem' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
        />
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            opacity: 0,
            background: 'rgba(15, 15, 20, 0.95)',
            color: '#ececec',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.15s',
            zIndex: 10
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        <span>30 days ago</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
           <span>Legend:</span>
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--success)', borderRadius: '2px'}}></span> Online
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--danger)', borderRadius: '2px'}}></span> Offline
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--surface-hover)', borderRadius: '2px'}}></span> No data
        </div>
        <span>Today</span>
      </div>
    </div>
  );
}
