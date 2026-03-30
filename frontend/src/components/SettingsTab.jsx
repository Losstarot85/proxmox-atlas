import React, { useState, useEffect } from "react";

export function SettingsTab({ globalInterval, onSaveSettings }) {
  const [intervalVal, setIntervalVal] = useState(globalInterval);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setIntervalVal(globalInterval);
  }, [globalInterval]);

  const handleSave = async () => {
    if (intervalVal < 5) {
      setError("Minimum polling interval cannot be lower than 5 seconds.");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polling_interval: intervalVal })
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error saving settings");
      }
      
      const data = await res.json();
      setSuccess(true);
      onSaveSettings(data.settings.polling_interval);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIntervalVal(globalInterval);
    setError(null);
    setSuccess(false);
  };

  const handleDefault = () => {
    setIntervalVal(15);
    setError(null);
  };

  return (
    <div className="settings-content">
      <div className="glass-card">
        <div className="setting-group">
          <div className="setting-info">
            <h3>Proxmox Polling Interval</h3>
            <p>
              Seconds to wait between backend data updates. Alters dynamically both frontend API fetching and backend network load on cluster hosts.
            </p>
          </div>
          <div className="setting-control">
            <input 
              type="number" 
              className="input-number"
              min="5"
              value={intervalVal} 
              onChange={e => setIntervalVal(parseInt(e.target.value, 10) || 5)} 
            />
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>sec</span>
          </div>
        </div>

        <div className="alert-message alert-warning">
          <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>⚠️</span>
          <div>
            <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)" }}>Cluster Load Warning</strong>
            <span>Setting very low intervals might saturate `pveproxy` service and cause infrastructure delays on your Proxmox VE panels. Use with caution.</span>
          </div>
        </div>

        {error && (
          <div className="alert-message global-error">
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <p className="msg-success">✅ Global settings saved successfully.</p>
        )}

        <div className="settings-actions">
          <button className="btn" onClick={handleDefault} disabled={isSaving}>Load Default (15s)</button>
          <div className="actions-right">
            <button className="btn" onClick={handleCancel} disabled={isSaving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
               {isSaving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
