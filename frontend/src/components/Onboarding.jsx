import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, XCircle, CheckCircle2, PartyPopper, Globe, Sparkles } from 'lucide-react';
import { useI18n } from "../i18n";
import { API_BASE } from "../config";

export function OnboardingWizard({ onComplete, onSkip }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1); // 1: Welcome, 2: Add Cluster, 3: Success
  const [newCluster, setNewCluster] = useState({
    name: "",
    host: "",
    token_id: "",
    token_secret: "",
    verify_ssl: false,
  });
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(null);

  const wizardRef = useRef(null);

  useEffect(() => {
    wizardRef.current?.focus();

    // Trap focus inside onboarding modal
    const handleKeyDown = (e) => {
      if (e.key === "Tab") {
        if (!wizardRef.current) return;
        const focusable = wizardRef.current.querySelectorAll(
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
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/clusters/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCluster),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.detail || "Connection test failed." });
      } else {
        setTestResult({ ok: true, message: `Connected! Proxmox VE ${data.version} (${data.release})` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddCluster = async (e) => {
    e.preventDefault();
    if (!newCluster.name || !newCluster.host || !newCluster.token_id || !newCluster.token_secret) {
      setError(t("onboarding.validation_error", "All fields are required."));
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/clusters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCluster),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error saving cluster configuration.");
      setStep(3); // Success step
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="presentation">
      <div
        ref={wizardRef}
        tabIndex="-1"
        className="onboarding-modal glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        style={{ outline: "none" }}
      >
        {/* Progress indicator */}
        <div className="onboarding-progress-bar">
          <div className="progress-fill" style={{ width: `${(step / 3) * 100}%` }}></div>
        </div>

        {step < 3 && onSkip && (
          <button 
            type="button" 
            className="btn-close" 
            onClick={onSkip} 
            aria-label="Skip setup wizard"
            style={{ position: "absolute", top: "1rem", right: "1rem", background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)", zIndex: 10 }}
          >
            ×
          </button>
        )}

        {step === 1 && (
          <div className="onboarding-step-content">
            <div className="illustration-wrapper">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="onboarding-svg">
                <circle cx="60" cy="60" r="50" fill="rgba(147, 51, 234, 0.05)" stroke="var(--accent)" strokeWidth="2" />
                <path d="M40 50 L55 65 L80 40" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="60" cy="60" r="30" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" className="spin-circle" />
              </svg>
            </div>
            <h2 id="onboarding-title">{t("onboarding.welcome.title", "Welcome to Proxmox Atlas")}</h2>
            <p className="onboarding-desc">
              {t(
                "onboarding.welcome.desc",
                "Atlas is a real-time monitor, analytics engine, and predictive what-if simulator for Proxmox VE hypervisors."
              )}
            </p>
            <div className="onboarding-actions" style={{ gap: "1rem" }}>
              {onSkip && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onSkip}
                  aria-label="Skip setup wizard"
                >
                  {t("common.skip", "Skip")}
                </button>
              )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStep(2)}
                  aria-label="Proceed to add cluster configuration"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                >
                  {t("onboarding.welcome.cta", "Get Started")} <ArrowRight size={16} />
                </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step-content">
            <h2 id="onboarding-title">{t("onboarding.add_cluster.title", "Add your first cluster")}</h2>
            <p className="onboarding-desc">
              {t(
                "onboarding.add_cluster.desc",
                "Provide API credentials to establish monitoring. Atlas requires read access to cluster metrics."
              )}
            </p>

            <form onSubmit={handleAddCluster} className="onboarding-form">
              {error && <div className="msg-error" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}><XCircle size={16} /> {error}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="wizard-name">{t("settings.clusters.name", "Cluster Name")}</label>
                  <input
                    id="wizard-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Production-Cluster"
                    value={newCluster.name}
                    onChange={(e) => setNewCluster({ ...newCluster, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wizard-host">{t("settings.clusters.host", "Proxmox Host URL")}</label>
                  <input
                    id="wizard-host"
                    type="url"
                    className="form-control"
                    placeholder="https://192.168.1.100:8006"
                    value={newCluster.host}
                    onChange={(e) => setNewCluster({ ...newCluster, host: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wizard-token-id">{t("settings.clusters.token_id", "Token ID")}</label>
                  <input
                    id="wizard-token-id"
                    type="text"
                    className="form-control"
                    placeholder="root@pam!atlas"
                    value={newCluster.token_id}
                    onChange={(e) => setNewCluster({ ...newCluster, token_id: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wizard-token-secret">{t("settings.clusters.token_secret", "Token Secret")}</label>
                  <input
                    id="wizard-token-secret"
                    type="password"
                    className="form-control"
                    placeholder="Secret Key"
                    value={newCluster.token_secret}
                    onChange={(e) => setNewCluster({ ...newCluster, token_secret: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group checkbox-group" style={{ marginTop: "1rem" }}>
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={newCluster.verify_ssl}
                    onChange={(e) => setNewCluster({ ...newCluster, verify_ssl: e.target.checked })}
                  />
                  <span className="checkbox-custom"></span>
                  <span className="option-label">{t("settings.clusters.verify_ssl", "Verify SSL certificate")}</span>
                </label>
              </div>

              {testResult && (
                <div
                  className={`test-result-box ${testResult.ok ? "test-success" : "test-fail"}`}
                  style={{
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginTop: "1rem",
                    fontSize: "0.85rem",
                    background: testResult.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    color: testResult.ok ? "var(--accent-light, #10b981)" : "#ef4444",
                    border: `1px solid ${testResult.ok ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`
                  }}
                >
                  {testResult.ok ? <CheckCircle2 size={14} style={{ color: 'var(--success)', display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} /> : <XCircle size={14} style={{ color: 'var(--danger)', display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} />}
                  {testResult.message}
                </div>
              )}

              <div className="onboarding-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  disabled={isTesting || isAdding}
                >
                  {t("common.back", "Back")}
                </button>
                <button
                  type="button"
                  className="btn btn-info"
                  onClick={handleTestConnection}
                  disabled={isTesting || isAdding}
                >
                  {isTesting ? t("settings.clusters.testing", "Testing...") : t("settings.clusters.test", "Test Connection")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isTesting || isAdding}
                >
                  {isAdding ? t("common.saving", "Saving...") : t("settings.clusters.add", "Add Cluster")}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step-content">
            <div className="illustration-wrapper">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="onboarding-svg">
                <circle cx="60" cy="60" r="50" fill="rgba(16, 185, 129, 0.05)" stroke="var(--accent-light, #10b981)" strokeWidth="2" />
                <path d="M42 60 L54 72 L78 48" stroke="var(--accent-light, #10b981)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
              </svg>
            </div>
            <h2 id="onboarding-title">{t("onboarding.done.title", "All Set!")}</h2>
            <p className="onboarding-desc">
              {t(
                "onboarding.done.desc",
                "Your Proxmox cluster has been configured successfully. Atlas is now polling cluster metrics in the background."
              )}
            </p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onComplete}
                aria-label="Enter dashboard interface"
              >
                {t("onboarding.done.cta", "Enter Dashboard")} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChangelogModal({ onClose }) {
  const { t } = useI18n();
  const changelogRef = useRef(null);

  useEffect(() => {
    changelogRef.current?.focus();

    // Trap focus inside changelog modal
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
      }
      if (e.key === "Tab") {
        if (!changelogRef.current) return;
        const focusable = changelogRef.current.querySelectorAll(
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

  return (
    <div className="onboarding-overlay" onClick={onClose} role="presentation">
      <div
        ref={changelogRef}
        tabIndex="-1"
        className="onboarding-modal changelog-modal glass-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        style={{ outline: "none" }}
      >
        <div className="changelog-header">
          <h2 id="changelog-title">🚀 What's New in Atlas v1.3.0</h2>
          <button 
            type="button" 
            className="btn-close" 
            onClick={onClose} 
            aria-label="Close what's new dialog"
            style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}
          >
            ×
          </button>
        </div>
        
        <div className="changelog-body" style={{ margin: "1.5rem 0", textAlign: "left" }}>
          <div className="changelog-feature">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Globe size={18} /> Full Internationalization (i18n)</h3>
            <p>
              We've localized Proxmox Atlas into 6 languages: English, Italian, German, Spanish, French, and Chinese! You can toggle language instantly via the select dropdown in the Settings tab.
            </p>
          </div>

          <div className="changelog-feature" style={{ marginTop: "1rem" }}>
            <h3>Enhanced Accessibility (a11y)</h3>
            <p>
              Atlas is now fully compliant with WCAG 2.1 AA requirements. Features include full keyboard control, focus trap dialogs, skip-to-content navigation, and native screen reader announcements.
            </p>
          </div>

          <div className="changelog-feature" style={{ marginTop: "1rem" }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Sparkles size={18} /> Onboarding & Discovery Guides</h3>
            <p>
              New features are flagged with blue pulsing discovery dots. Hover over complex components to view inline tooltips detailing their parameters.
            </p>
          </div>
        </div>

        <div className="onboarding-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            aria-label="Close changelog details"
          >
            Awesome, Let's Go!
          </button>
        </div>
      </div>
    </div>
  );
}
