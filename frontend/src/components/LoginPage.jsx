import React, { useState, useEffect, useRef } from "react";
import { Gamepad2 } from 'lucide-react';
import { useI18n } from "../i18n";
import { API_BASE } from "../config";
import "./LoginPage.css";

// ── SVG Eye Icons (inline to avoid external dependencies) ──
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
    <path d="m2 2 20 20"/>
  </svg>
);

// ── Typing Animation Hook ──
function useTypingAnimation(text, speed = 45, startDelay = 600) {
  const [displayed, setDisplayed] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let i = 0;
    let timer;

    const startTimeout = setTimeout(() => {
      timer = setInterval(() => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(timer);
          // Keep cursor blinking for a moment, then hide
          setTimeout(() => setShowCursor(false), 1500);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(startTimeout);
      if (timer) clearInterval(timer);
    };
  }, [text, speed, startDelay]);

  return { displayed, showCursor };
}

// ── Password Input with Toggle ──
function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="login-password-wrapper">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className="login-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="login-pw-toggle"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? "hide password" : "show password"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

// ── Main Component ──
export function LoginPage({ onLogin, onChangePassword, mustChangePassword, error }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const [demoAvailable, setDemoAvailable] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/auth/demo-status`)
      .then(res => res.json())
      .then(data => {
        if (data && data.demo_available) {
          setDemoAvailable(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDemoLogin = async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/demo`, { method: "POST" });
      const data = await res.json();
      if (data.token) {
        onLogin(data.username, data.token, data.role, false);
      } else {
        setLocalError(data.error || "Demo login failed");
      }
    } catch (err) {
      setLocalError("Network error during demo login");
    } finally {
      setLoading(false);
    }
  };

  const subtitleText = mustChangePassword
    ? t('login.must_change_password')
    : t('login.subtitle');

  const { displayed, showCursor } = useTypingAnimation(subtitleText, 40, 500);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword.length < 6) {
      setLocalError(t('settings.password.error_length'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError(t('login.passwords_no_match'));
      return;
    }

    setLoading(true);
    await onChangePassword(password, newPassword);
    setLoading(false);
  };

  const displayError = localError || error;

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* Logo & Title */}
        <div className="login-logo">
          <picture>
            <source srcSet="/logo.webp" type="image/webp" />
            <img
              src="/logo.png"
              alt="Proxmox Atlas"
              className="login-logo-img"
            />
          </picture>
          <h1 className="login-title">{t('login.title')}</h1>
          <p className="login-subtitle">
            <span className={`login-subtitle-typing${showCursor ? '' : ' done'}`}
                  style={!showCursor ? { borderColor: 'transparent' } : undefined}>
              {displayed}
            </span>
          </p>
        </div>

        {/* Error */}
        {displayError && (
          <div className="login-error" key={displayError}>
            {displayError}
          </div>
        )}

        {!mustChangePassword ? (
          /* ===== LOGIN FORM ===== */
          <form onSubmit={handleLogin}>
            <div className="login-field">
              <label htmlFor="login-username" className="login-label">
                {t('settings.users.username')}
              </label>
              <input
                id="login-username"
                type="text"
                className="login-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder={t('login.username_placeholder')}
              />
            </div>

            <div className="login-field" style={{ marginBottom: '1.75rem' }}>
              <label htmlFor="login-password" className="login-label">
                {t('settings.users.password')}
              </label>
              <PasswordInput
                id="login-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder={t('login.password_placeholder')}
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              className="login-submit"
              disabled={loading || !username || !password}
            >
              {loading ? t('login.signing_in') : t('login.sign_in')}
            </button>

            {demoAvailable && (
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span>OR</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                </div>
                <button
                  type="button"
                  id="login-demo-btn"
                  onClick={handleDemoLogin}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: "rgba(59, 130, 246, 0.15)",
                    color: "var(--accent-light)",
                    border: "1px solid var(--accent-glow)",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                    <Gamepad2 size={18} />
                    Try Public Demo (Read-Only)
                  </span>
                </button>
              </div>
            )}
          </form>
        ) : (
          /* ===== CHANGE PASSWORD FORM ===== */
          <form onSubmit={handleChangePassword}>
            <div className="login-info-banner">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {t('login.must_change_password')}
            </div>

            <div className="login-field">
              <label htmlFor="new-password" className="login-label">
                {t('settings.password.new')}
              </label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="login-field" style={{ marginBottom: '1.75rem' }}>
              <label htmlFor="confirm-password" className="login-label">
                {t('settings.password.confirm')}
              </label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={t('login.confirm_password_placeholder')}
                autoComplete="new-password"
              />
            </div>

            <button
              id="change-password-submit"
              type="submit"
              className="login-submit"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? t('settings.password.changing') : t('login.set_password')}
            </button>
          </form>
        )}

        <p className="login-footer">
          Proxmox Atlas — Open Source Infrastructure Monitoring
        </p>
      </div>
    </div>
  );
}
