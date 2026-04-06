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
          throw new Error("Impossibile recuperare i dati storici: " + res.statusText);
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

  // Prepara una griglia di celle 30 colonne x 24 righe per gli ultimi 30 giorni misurati ad ore.
  // Poiché i dati da start a end potrebbero non allinearsi a mezzanotte esatta, li allineiamo indietro dalle ore attuali.
  const grid = useMemo(() => {
    const cols = 30;
    const rows = 24;
    const now = Math.floor(Date.now() / 1000);
    // Tronco all'ora spaccata attuale
    const currentHour = now - (now % 3600);
    const cells = [];
    
    // Convertiamo l'array map time -> is_up
    const map = new Map();
    data.forEach(d => {
      map.set(Math.floor(d.time), d.up);
    });

    for (let c = cols - 1; c >= 0; c--) {
      const colCells = [];
      for (let r = 0; r < rows; r++) {
        // Calcola il timestamp per quella colonna/riga.
        // Colonna 0 (ultimo indice loop) è giorno 30 giorni fa.
        // Riga 0 è l'ora 00 di quel giorno rlativo.
        // Andando a ritroso è più preciso: (giorni_mancanti * 24 + ore_mancanti)
        
        const hoursAgo = c * 24 + (23 - r);
        const cellTime = currentHour - (hoursAgo * 3600);
        
        let status = "nodata";
        
        // Trova il punto più vicino in un margine di 1 ora
        if (map.has(cellTime)) {
             status = map.get(cellTime) ? "up" : "down";
        } else {
             // fallback fuzzy search: cerchiamo la chiave più vicina entro 30 min (1800 sec)
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
     return <div style={{ fontSize: '0.85rem', color: "var(--text-secondary)", padding: "1rem" }}>Caricamento Availability Heatmap...</div>;
  }

  if (error) {
     return <div style={{ fontSize: '0.85rem', color: "var(--danger)", padding: "1rem" }}>{error}</div>;
  }

  // Se map vuota prometheus non ha ritornato nulla
  if (data.length === 0) {
    return <div style={{ fontSize: '0.85rem', color: "var(--text-secondary)", padding: "1rem" }}>Nessun dato di uptime storico da Prometheus per questo target negli ultimi 30 giorni.</div>;
  }

  return (
    <div className="uptime-heatmap-container" style={{
      marginTop: '1.5rem',
      paddingTop: '1rem',
      borderTop: '1px solid var(--border)',
    }}>
      <h4 style={{ marginBottom: "0.5rem", fontSize: "0.95rem", color: "var(--text-secondary)" }}>Reliability Status (30 Days)</h4>
      
      <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '3px' }}>
          {grid.map((col, cIdx) => (
            <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {col.map((cell, rIdx) => {
                let bg = "var(--surface-hover)";
                if (cell.status === "up") bg = "var(--success)";
                if (cell.status === "down") bg = "var(--danger)";
                
                const d = new Date(cell.time * 1000);
                const title = `${d.toLocaleString()} \nStatus: ${cell.status.toUpperCase()}`;
                
                return (
                  <div 
                    key={rIdx} 
                    title={title}
                    style={{
                      width: "10px",
                      height: "10px",
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
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        <span>30 giorni fa</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
           <span>Legenda:</span>
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--success)', borderRadius: '2px'}}></span> Online
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--danger)', borderRadius: '2px'}}></span> Offline
           <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--surface-hover)', borderRadius: '2px'}}></span> No data
        </div>
        <span>Oggi</span>
      </div>
    </div>
  );
}
