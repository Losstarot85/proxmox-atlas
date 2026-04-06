import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "./TimeMachineModal.css";

export function TimeMachineModal({ target, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Default range: ultime 24 ore
  const [timeRange, setTimeRange] = useState("24h");

  useEffect(() => {
    if (!target) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const end = Math.floor(Date.now() / 1000);
        let start = end - (24 * 3600);
        let step = 60; // 1 min per 24h
        
        if (timeRange === "7d") {
            start = end - (7 * 24 * 3600);
            step = 60 * 60; // 1 ora
        } else if (timeRange === "30d") {
            start = end - (30 * 24 * 3600);
            step = 60 * 60 * 6; // 6 ore
        }

        const res = await fetch(`/api/time-machine/${target.id}?target_type=${target.type}&start=${start}&end=${end}&step=${step}`);
        if (!res.ok) throw new Error("Errore nel caricamento dei dati storici");
        
        const json = await res.json();
        setData(json.results || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [target, timeRange]);

  if (!target) return null;

  const formatTime = (unixTime) => {
    if (!unixTime) return "";
    const date = new Date(unixTime * 1000);
    return date.toLocaleString();
  };

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal-content" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2>Time Machine: {target.name} ({target.type})</h2>
          <button className="tm-close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="tm-controls">
            <span style={{color: 'var(--text-secondary)'}}>Time Range: </span>
            <button className={`tm-btn ${timeRange === "24h" ? "active" : ""}`} onClick={() => setTimeRange("24h")}>24 Hours</button>
            <button className={`tm-btn ${timeRange === "7d" ? "active" : ""}`} onClick={() => setTimeRange("7d")}>7 Days</button>
            <button className={`tm-btn ${timeRange === "30d" ? "active" : ""}`} onClick={() => setTimeRange("30d")}>30 Days</button>
        </div>

        {loading && <div className="tm-status">Caricamento storico da Prometheus...</div>}
        {error && <div className="tm-status tm-error">Errore: {error}</div>}

        {!loading && !error && data.length === 0 && (
            <div className="tm-status">Nessun dato storico disponibile.</div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="tm-charts">
            
            <div className="tm-chart-box">
              <h3>CPU Usage (%)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" tickFormatter={formatTime} stroke="#888" minTickGap={50}/>
                  <YAxis stroke="#888" domain={[0, 'auto']} />
                  <Tooltip labelFormatter={formatTime} contentStyle={{backgroundColor: '#1e1e1e', borderColor: '#333'}} />
                  <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="tm-chart-box">
              <h3>Memory Used (Bytes)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" tickFormatter={formatTime} stroke="#888" minTickGap={50}/>
                  <YAxis stroke="#888" tickFormatter={(v) => (v / 1e9).toFixed(1) + "GB"} />
                  <Tooltip labelFormatter={formatTime} contentStyle={{backgroundColor: '#1e1e1e', borderColor: '#333'}} />
                  <Area type="monotone" dataKey="mem_used" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {target.type === "NODE" && data[data.length - 1]?.storage_used !== undefined && (
                <div className="tm-chart-box">
                <h3>Global Storage Usage (Bytes)</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" tickFormatter={formatTime} stroke="#888" minTickGap={50}/>
                    <YAxis stroke="#888" tickFormatter={(v) => (v / 1e9).toFixed(1) + "GB"} />
                    <Tooltip labelFormatter={formatTime} contentStyle={{backgroundColor: '#1e1e1e', borderColor: '#333'}} />
                    <Legend />
                    <Area type="monotone" dataKey="storage_total" name="Total Capacity" stroke="#64748b" fill="#64748b" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="storage_used" name="Used Space" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                    </AreaChart>
                </ResponsiveContainer>
                </div>
            )}

            {target.type === "VM" && (
                <div className="tm-chart-box">
                <h3>Disk I/O (Bytes/s)</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" tickFormatter={formatTime} stroke="#888" minTickGap={50}/>
                    <YAxis stroke="#888" tickFormatter={(v) => (v / 1e6).toFixed(1) + "MB"} />
                    <Tooltip labelFormatter={formatTime} contentStyle={{backgroundColor: '#1e1e1e', borderColor: '#333'}} />
                    <Legend />
                    <Area type="monotone" dataKey="disk_read" name="Read" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="disk_write" name="Write" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.3} />
                    </AreaChart>
                </ResponsiveContainer>
                </div>
            )}

            {target.type === "VM" && (
                <div className="tm-chart-box">
                <h3>Network I/O (Bytes/s)</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" tickFormatter={formatTime} stroke="#888" minTickGap={50}/>
                    <YAxis stroke="#888" tickFormatter={(v) => (v / 1e6).toFixed(1) + "MB"} />
                    <Tooltip labelFormatter={formatTime} contentStyle={{backgroundColor: '#1e1e1e', borderColor: '#333'}} />
                    <Legend />
                    <Area type="monotone" dataKey="net_in" name="RX" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="net_out" name="TX" stroke="#d946ef" fill="#d946ef" fillOpacity={0.3} />
                    </AreaChart>
                </ResponsiveContainer>
                </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}
