import React, { useState, useEffect } from "react";

export function SettingsTab({ globalInterval, globalWebhooks, onSaveSettings }) {
  const [intervalVal, setIntervalVal] = useState(globalInterval);
  const [webhooks, setWebhooks] = useState(globalWebhooks || []);
  const [logs, setLogs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setIntervalVal(globalInterval);
    setWebhooks(globalWebhooks || []);
  }, [globalInterval, globalWebhooks]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/alerts/webhook_logs");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Failed to fetch webhook logs", err);
      }
    };
    fetchLogs();
    const inv = setInterval(fetchLogs, 10000);
    return () => clearInterval(inv);
  }, []);

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
        body: JSON.stringify({ 
          polling_interval: intervalVal,
          webhooks: webhooks
        })
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error saving settings");
      }
      
      const data = await res.json();
      setSuccess(true);
      onSaveSettings(data.settings);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIntervalVal(globalInterval);
    setWebhooks(globalWebhooks || []);
    setError(null);
    setSuccess(false);
  };

  const handleDefault = () => {
    setIntervalVal(15);
    setWebhooks([]);
    setError(null);
  };

  const handleAddWebhook = () => {
    setWebhooks([
      ...webhooks,
      {
        id: crypto.randomUUID(),
        name: "New Webhook",
        url: "",
        severity_filter: "all",
        json_template: "{ \"text\": \"Alert: {{message}}\" }"
      }
    ]);
  };

  const handleUpdateWebhook = (id, field, value) => {
    setWebhooks(webhooks.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const handleRemoveWebhook = (id) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
  };

  const formatTime = (ts) => new Date(ts * 1000).toLocaleString();

  return (
    <div className="settings-content" style={{ maxWidth: '1000px' }}>
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="setting-group" style={{ borderBottom: 'none' }}>
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
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div>
            <h3>Webhook Alerts Export</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, marginTop: '0.25rem' }}>
              Configure multiple webhook endpoints to dispatch generated alerts externally.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleAddWebhook}>+ Add Webhook</button>
        </div>

        {webhooks.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>No webhooks configured.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {webhooks.map((wh, idx) => (
              <div key={wh.id} style={{ background: 'rgba(0,0,0,0.15)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Name</label>
                    <input type="text" className="search-input" style={{ width: '100%', padding: '0.5rem' }} value={wh.name} onChange={e => handleUpdateWebhook(wh.id, 'name', e.target.value)} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Endpoint URL</label>
                    <input type="url" className="search-input" style={{ width: '100%', padding: '0.5rem' }} placeholder="https://" value={wh.url} onChange={e => handleUpdateWebhook(wh.id, 'url', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Severity Filter</label>
                    <select className="search-input" style={{ width: '100%', padding: '0.5rem', appearance: 'auto' }} value={wh.severity_filter} onChange={e => handleUpdateWebhook(wh.id, 'severity_filter', e.target.value)}>
                      <option value="all">All Alerts</option>
                      <option value="critical">Critical Only</option>
                      <option value="warning">Warning Only</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn" style={{ padding: '0.5rem 1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => handleRemoveWebhook(wh.id)}>Remove</button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>JSON Template (Available vars: {'{{message}}'}, {'{{severity}}'}, {'{{cluster}}'}, {'{{node}}'})</label>
                  <textarea 
                    className="search-input" 
                    style={{ width: '100%', minHeight: '80px', padding: '0.5rem', fontFamily: 'var(--mono)', fontSize: '0.85rem' }} 
                    value={wh.json_template} 
                    onChange={e => handleUpdateWebhook(wh.id, 'json_template', e.target.value)} 
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="alert-message global-error" style={{ marginTop: '1.5rem' }}>
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <p className="msg-success" style={{ marginTop: '1.5rem' }}>✅ Global settings saved successfully.</p>
        )}

        <div className="settings-actions">
          <button className="btn" onClick={handleDefault} disabled={isSaving}>Load Default (15s)</button>
          <div className="actions-right">
            <button className="btn" onClick={handleCancel} disabled={isSaving}>Cancel changes</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
               {isSaving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>Webhook Delivery History</h3>
        
        <div className="table-wrapper" style={{ marginBottom: 0 }}>
          <div className="responsive-table" style={{ maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Webhook</th>
                  <th>Status</th>
                  <th>HTTP Code</th>
                  <th>Error Output</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan="5" className="empty-state" style={{ padding: '2rem' }}>No webhook delivery logs yet.</td></tr>
                ) : (
                  logs.map((log, i) => (
                    <tr key={i}>
                      <td className="mono-cell" style={{ fontSize: '0.8rem' }}>{formatTime(log.timestamp)}</td>
                      <td>{log.webhook_name}</td>
                      <td>
                        {log.success 
                          ? <span className="badge badge-online" style={{ padding: '0.2rem 0.5rem' }}>Delivered</span> 
                          : <span className="badge badge-offline" style={{ padding: '0.2rem 0.5rem' }}>Failed</span>}
                      </td>
                      <td className="mono-cell" style={{ color: log.success ? 'var(--text-primary)' : 'var(--danger)' }}>
                        {log.status_code || "ERR"}
                      </td>
                      <td className="mono-cell" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {log.error || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
