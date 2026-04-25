import React, { useState, useEffect } from "react";
import { API_BASE } from "../config";

export function SettingsTab({ globalInterval, globalWebhooks, onSaveSettings }) {
  const [intervalVal, setIntervalVal] = useState(globalInterval);
  const [webhooks, setWebhooks] = useState(globalWebhooks || []);
  const [logs, setLogs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Password change state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Cluster Management State
  const [clusters, setClusters] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCluster, setNewCluster] = useState({ name: "", host: "", token_id: "", token_secret: "", verify_ssl: false });
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [clusterError, setClusterError] = useState(null);
  const [clusterSuccess, setClusterSuccess] = useState(null);

  useEffect(() => {
    setIntervalVal(globalInterval);
    setWebhooks(globalWebhooks || []);
  }, [globalInterval, globalWebhooks]);

  // Fetch clusters list
  useEffect(() => { fetchClusters(); }, []);

  const fetchClusters = async () => {
    try {
      const res = await fetch(`${API_BASE}/clusters`);
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters || []);
      }
    } catch (err) {
      console.error("Failed to fetch clusters", err);
    }
  };

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/alerts/webhook_logs`);
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

  // -- Cluster Actions --
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setClusterError(null);
    try {
      const res = await fetch(`${API_BASE}/clusters/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCluster)
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.detail || "Test fallito" });
      } else {
        setTestResult({ ok: true, message: `Proxmox VE ${data.version} (${data.release})` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddCluster = async () => {
    if (!newCluster.name || !newCluster.host || !newCluster.token_id || !newCluster.token_secret) {
      setClusterError("Tutti i campi sono obbligatori.");
      return;
    }
    setIsAdding(true);
    setClusterError(null);
    setClusterSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/clusters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCluster)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error");
      setClusterSuccess(`Cluster '${newCluster.name}' added. Polling will start automatically.`);
      setNewCluster({ name: "", host: "", token_id: "", token_secret: "", verify_ssl: false });
      setTestResult(null);
      setShowAddForm(false);
      fetchClusters();
      setTimeout(() => setClusterSuccess(null), 5000);
    } catch (err) {
      setClusterError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCluster = async (name) => {
    if (!confirm(`Delete cluster '${name}'? It will be removed from monitoring.`)) return;
    setClusterError(null);
    try {
      const res = await fetch(`${API_BASE}/clusters/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error");
      setClusterSuccess(`Cluster '${name}' removed.`);
      fetchClusters();
      setTimeout(() => setClusterSuccess(null), 5000);
    } catch (err) {
      setClusterError(err.message);
    }
  };

  // -- Settings Actions --
  const handleSave = async () => {
    if (intervalVal < 5) {
      setError("Minimum polling interval cannot be lower than 5 seconds.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polling_interval: intervalVal, webhooks: webhooks })
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
    setWebhooks([...webhooks, {
      id: crypto.randomUUID(),
      name: "New Webhook",
      url: "",
      severity_filter: "all",
      json_template: "{ \"text\": \"Alert: {{message}}\" }"
    }]);
  };

  const handleUpdateWebhook = (id, field, value) => {
    setWebhooks(webhooks.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const handleRemoveWebhook = (id) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
  };

  const formatTime = (ts) => new Date(ts * 1000).toLocaleString("sv-SE");

    return (
    <div className="settings-content" style={{ maxWidth: '1000px' }}>

      {/* ==================== ACCOUNT SECURITY ==================== */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h3>🔐 Account Security</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, marginTop: '0.25rem' }}>
            Change the admin password for accessing Proxmox Atlas.
          </p>
        </div>

        {pwError && (
          <div className="global-error" style={{ marginBottom: '1rem' }}>
            <span>❌</span><span>{pwError}</span>
          </div>
        )}
        {pwSuccess && (
          <p className="msg-success" style={{ marginBottom: '1rem' }}>✅ Password changed successfully.</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Current Password</label>
            <input type="password" className="search-input" style={{ width: '100%', padding: '0.5rem' }} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>New Password</label>
            <input type="password" className="search-input" style={{ width: '100%', padding: '0.5rem' }} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Confirm New Password</label>
            <input type="password" className="search-input" style={{ width: '100%', padding: '0.5rem' }} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={pwSaving || !currentPw || !newPw || !confirmPw} onClick={async () => {
            setPwError(null);
            setPwSuccess(false);
            if (newPw.length < 6) { setPwError("Password must be at least 6 characters"); return; }
            if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
            setPwSaving(true);
            try {
              const res = await fetch(`${API_BASE}/auth/change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ old_password: currentPw, new_password: newPw })
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail || "Error changing password");
              }
              const data = await res.json();
              // Update token in localStorage with new one
              if (data.token) localStorage.setItem("atlas-auth-token", data.token);
              setPwSuccess(true);
              setCurrentPw(""); setNewPw(""); setConfirmPw("");
              setTimeout(() => setPwSuccess(false), 5000);
            } catch (err) {
              setPwError(err.message);
            } finally {
              setPwSaving(false);
            }
          }}>
            {pwSaving ? "Changing..." : "🔒 Change Password"}
          </button>
        </div>
      </div>
      {/* ==================== CLUSTER MANAGEMENT ==================== */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div>
            <h3>🖥️ Cluster Management</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, marginTop: '0.25rem' }}>
              Add, test, and remove Proxmox clusters. Changes take effect immediately without restart.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowAddForm(!showAddForm); setTestResult(null); setClusterError(null); }}>
            {showAddForm ? "Cancel" : "+ Add Cluster"}
          </button>
        </div>

        {clusterError && (
          <div className="global-error" style={{ marginBottom: '1rem' }}>
            <span>❌</span><span>{clusterError}</span>
          </div>
        )}
        {clusterSuccess && (
          <p className="msg-success" style={{ marginBottom: '1rem' }}>✅ {clusterSuccess}</p>
        )}

        {/* Add Cluster Form */}
        {showAddForm && (
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Cluster Name</label>
                <input type="text" className="search-input" style={{ width: '100%', padding: '0.5rem' }} placeholder="es. datacenter-roma" value={newCluster.name} onChange={e => setNewCluster({ ...newCluster, name: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Host URL</label>
                <input type="url" className="search-input" style={{ width: '100%', padding: '0.5rem' }} placeholder="https://192.168.1.100:8006" value={newCluster.host} onChange={e => setNewCluster({ ...newCluster, host: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Token ID</label>
                <input type="text" className="search-input" style={{ width: '100%', padding: '0.5rem' }} placeholder="root@pam!mytoken" value={newCluster.token_id} onChange={e => setNewCluster({ ...newCluster, token_id: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Token Secret</label>
                <input type="password" className="search-input" style={{ width: '100%', padding: '0.5rem' }} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={newCluster.token_secret} onChange={e => setNewCluster({ ...newCluster, token_secret: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newCluster.verify_ssl} onChange={e => setNewCluster({ ...newCluster, verify_ssl: e.target.checked })} />
                Verify SSL Certificate
              </label>
            </div>

            {testResult && (
              <div style={{ 
                padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', 
                background: testResult.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                border: `1px solid ${testResult.ok ? '#22c55e' : 'var(--danger)'}`,
                color: testResult.ok ? '#22c55e' : 'var(--danger)', fontSize: '0.9rem'
              }}>
                {testResult.ok ? '✅' : '❌'} {testResult.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={handleTestConnection} disabled={isTesting || !newCluster.host || !newCluster.token_id || !newCluster.token_secret} style={{ borderColor: 'var(--accent)' }}>
                {isTesting ? "Testing..." : "🔌 Test Connection"}
              </button>
              <button className="btn btn-primary" onClick={handleAddCluster} disabled={isAdding || !testResult?.ok} title={!testResult?.ok ? "Test connection before adding" : ""}>
                {isAdding ? "Adding..." : "Add Cluster"}
              </button>
            </div>
          </div>
        )}

        {/* Clusters Table */}
        <div className="table-wrapper" style={{ marginBottom: 0 }}>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Host</th>
                  <th>Token ID</th>
                  <th>Secret</th>
                  <th>SSL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clusters.length === 0 ? (
                  <tr><td colSpan="6" className="empty-state" style={{ padding: '2rem' }}>No clusters configured.</td></tr>
                ) : (
                  clusters.map(c => (
                    <tr key={c.name}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td className="mono-cell" style={{ fontSize: '0.85rem' }}>{c.host}</td>
                      <td className="mono-cell" style={{ fontSize: '0.85rem' }}>{c.token_id}</td>
                      <td className="mono-cell" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.token_secret_masked}</td>
                      <td>{c.verify_ssl ? <span className="badge badge-online">Yes</span> : <span className="badge" style={{ opacity: 0.5 }}>No</span>}</td>
                      <td>
                        <button className="btn btn-sm" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: '0.75rem' }} onClick={() => handleDeleteCluster(c.name)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ==================== POLLING INTERVAL ==================== */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="setting-group" style={{ borderBottom: 'none' }}>
          <div className="setting-info">
            <h3>Proxmox Polling Interval</h3>
            <p>Seconds to wait between backend data updates. Alters dynamically both frontend API fetching and backend network load on cluster hosts.</p>
          </div>
          <div className="setting-control">
            <input type="number" className="input-number" min="5" value={intervalVal} onChange={e => setIntervalVal(parseInt(e.target.value, 10) || 5)} />
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>sec</span>
          </div>
        </div>

        {error && (
          <div className="alert-message global-error" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <span>❌</span><span>{error}</span>
          </div>
        )}
        {success && (
          <p className="msg-success" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>✅ Global settings saved successfully.</p>
        )}

        <div className="settings-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <button className="btn" onClick={handleDefault} disabled={isSaving}>Load Default (15s)</button>
          <div className="actions-right">
            <button className="btn" onClick={handleCancel} disabled={isSaving}>Cancel changes</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
               {isSaving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>

      {/* ==================== WEBHOOKS ==================== */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div>
            <h3>Webhook Alerts Export</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, marginTop: '0.25rem' }}>Configure multiple webhook endpoints to dispatch generated alerts externally.</p>
          </div>
          <button className="btn btn-primary" onClick={handleAddWebhook}>+ Add Webhook</button>
        </div>

        {webhooks.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>No webhooks configured.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {webhooks.map((wh) => (
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
                  <textarea className="search-input" style={{ width: '100%', minHeight: '80px', padding: '0.5rem', fontFamily: 'var(--mono)', fontSize: '0.85rem' }} value={wh.json_template} onChange={e => handleUpdateWebhook(wh.id, 'json_template', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================== DELIVERY HISTORY ==================== */}
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
