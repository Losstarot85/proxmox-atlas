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
      setError("L'intervallo minimo non può scendere sotto i 5 secondi.");
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
        throw new Error(d.detail || "Errore durante il salvataggio");
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
    <section className="settings-section">
      <h2>Global Configurations</h2>
      
      <div className="settings-card">
        <div className="setting-row">
          <div className="setting-info">
            <h3>Proxmox Polling Interval</h3>
            <p>
              Tempo in secondi che il backend attende tra un resoconto dati e il successivo. 
              Altera dinamicamente sia l'API fetching del frontend sia lo sforzo di rete backend.
            </p>
          </div>
          <div className="setting-control">
            <input 
              type="number" 
              className="number-input"
              min="5"
              value={intervalVal} 
              onChange={e => setIntervalVal(parseInt(e.target.value, 10) || 5)} 
            />
            <span className="unit">sec</span>
          </div>
        </div>

        <div className="alert-box warning-box">
          <span className="alert-icon">⚠️</span>
          <div>
            <strong>Attenzione al carico del Cluster</strong>
            <p>Valori troppo bassi possono saturare `pveproxy` e generare delay infrastrutturali al pannello Proxmox VE.</p>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success-msg">✅ Impostazioni salvate correttamente.</p>}

        <div className="settings-footer">
          <button className="btn outline" onClick={handleDefault} disabled={isSaving}>Load Default (15s)</button>
          <div className="settings-footer-right">
            <button className="btn outline" onClick={handleCancel} disabled={isSaving}>Cancel</button>
            <button className="btn primary" onClick={handleSave} disabled={isSaving}>
               {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
