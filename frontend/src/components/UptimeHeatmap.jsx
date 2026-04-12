import React, { useState, useEffect, useMemo } from "react";

export function UptimeHeatmap({ target }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const fetchUptime = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/time-machine/uptime?target_id=${encodeURIComponent(target.id)}&target_type=${encodeURIComponent(target.type)}&days=30`);
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

  // Build a 30-column x 24-row grid for the last 30 days, measured hourly.
  // Since data from start to end may not align to exact midnight, we align backwards from the current hour.
  const grid = useMemo(() => {
    const cols = 60;
    const rows = 12;
    const now = Math.floor(Date.now() / 1000);
    // Truncate to the current full hour
    const currentHour = now - (now % 3600);
    const cells = [];
    
    // Convert the data array into a time -> is_up map
    const map = new Map();
    data.forEach(d => {
      map.set(Math.floor(d.time), d.up);
    });

    for (let c = cols - 1; c >= 0; c--) {
      const colCells = [];
      for (let r = 0; r < rows; r++) {
        // Calculate the timestamp for this column/row.
        // Column 0 (last loop index) = 30 days ago.
        // Row 0 = hour 0 of that relative block.
        // Counting backwards: (blocks_ago * rows_per_block + hours_offset)
        
        const hoursAgo = c * rows + ((rows - 1) - r);
        const cellTime = currentHour - (hoursAgo * 3600);
        
        let status = "nodata";
        
        // Find the closest data point within a 1-hour margin
        if (map.has(cellTime)) {
             status = map.get(cellTime) ? "up" : "down";
        } else {
             // Fallback fuzzy search: find the nearest key within 30 min (1800 sec)
             let closest = null;
             let minDiff = 1801;
             for (let key of map.keys()) {
               let diff = Math.abs(key - cellTime);
               if (diff <= 1800 && diff < minDiff) {
                 minDiff = diff;
                 closest = key;
               }
             }
             if (closest) {
               status = map.get(closest) ? "up" : "down";
             }
        }
        
        colCells.push({ time: cellTime, status });
      }
      cells.push(colCells);
    }
    return cells;
  }, [data]);

  if (loading) {
     return <div style={{ fontSize: '0.85rem', color: "var(--text-secondary)", padding: "1rem" }}>Loading Availability Heatmap...</div>;
  }

  if (error) {
     return <div style={{ fontSize: '0.85rem', color: "var(--danger)", padding: "1rem" }}>{error}</div>;
  }

  // If the map is empty, Prometheus returned no data
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
      
      <div style={{ display: 'flex', width: '100%', paddingBottom: '0.5rem', gap: '3px' }}>
          {grid.map((col, cIdx) => (
            <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
              {col.map((cell, rIdx) => {
                let bg = "var(--surface-hover)";
                if (cell.status === "up") bg = "var(--success)";
                if (cell.status === "down") bg = "var(--danger)";
                
                const d = new Date(cell.time * 1000);
                const title = `${d.toLocaleString("sv-SE")} \nStatus: ${cell.status.toUpperCase()}`;
                
                return (
                  <div 
                    key={rIdx} 
                    title={title}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: "2px",
                      backgroundColor: bg,
                      opacity: cell.status === "nodata" ? 0.3 : 1
                    }}
                  />
                )
              })}
            </div>
          ))}
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
