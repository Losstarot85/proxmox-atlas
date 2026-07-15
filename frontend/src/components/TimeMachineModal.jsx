import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../config";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { UptimeHeatmap } from "./UptimeHeatmap";
import { SkeletonChart } from "./Skeletons";
import "./TimeMachineModal.css";

export function TimeMachineModal({ target, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);
  
  // Default range: last 24 hours
  const [timeRange, setTimeRange] = useState("24h");

  useEffect(() => {
    if (!target) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const end = Math.floor(Date.now() / 1000);
        let start = end - (24 * 3600);
        let step = 60; // 1 min resolution for 24h
        
        if (timeRange === "7d") {
            start = end - (7 * 24 * 3600);
            step = 60 * 60; // 1 hour resolution
        } else if (timeRange === "30d") {
            start = end - (30 * 24 * 3600);
            step = 60 * 60 * 6; // 6 hour resolution
        }

        const res = await fetch(`${API_BASE}/time-machine/${target.id}?target_type=${target.type}&target_name=${encodeURIComponent(target.name || "")}&start=${start}&end=${end}&step=${step}`);
        if (!res.ok) throw new Error("Failed to load historical data");
        
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

  useEffect(() => {
    // Focus the modal content area on mount
    modalRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      }
      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!target) return null;

  const formatTime = (unixTime) => {
    if (!unixTime) return "";
    const date = new Date(unixTime * 1000);
    return date.toLocaleString("sv-SE");
  };

  return (
    <div className="tm-modal-overlay" onClick={onClose} role="presentation">
      <div 
        ref={modalRef}
        tabIndex="-1"
        className="tm-modal-content" 
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-title"
        style={{ outline: "none" }}
      >
        <div className="tm-modal-header">
          <h2 id="tm-title">Time Machine: {target.name} ({target.type})</h2>
          <button className="tm-close-btn" onClick={onClose} aria-label="Close dialogue">✕</button>
        </div>
        
        <div className="tm-controls">
            <span style={{color: 'var(--text-secondary)'}}>Time Range: </span>
            <button className={`tm-btn ${timeRange === "24h" ? "active" : ""}`} onClick={() => setTimeRange("24h")}>24 Hours</button>
            <button className={`tm-btn ${timeRange === "7d" ? "active" : ""}`} onClick={() => setTimeRange("7d")}>7 Days</button>
            <button className={`tm-btn ${timeRange === "30d" ? "active" : ""}`} onClick={() => setTimeRange("30d")}>30 Days</button>
        </div>

        {loading && <SkeletonChart count={4} />}
        {error && <div className="tm-status tm-error">Error: {error}</div>}

        {!loading && !error && data.length === 0 && (
            <div className="tm-status">No historical data available.</div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="tm-charts">
            
            <details style={{ marginBottom: "2rem", width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", fontSize: "1.1rem" }}>
                 Reliability History (30-Day Uptime)
              </summary>
              <UptimeHeatmap target={target} />
            </details>

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

            {(target.type === "VM" || target.type === "LXC") && (
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

            {(target.type === "VM" || target.type === "LXC") && (
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
