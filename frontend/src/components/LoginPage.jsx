import React, { useState } from "react";

export function LoginPage({ onLogin, onChangePassword, mustChangePassword, error }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

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
      setLocalError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    setLoading(true);
    await onChangePassword(password, newPassword);
    setLoading(false);
  };

  const displayError = localError || error;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100%',
      background: 'var(--bg-primary)',
      padding: '1rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '2.5rem 2rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        {/* Logo/Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🌐</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Proxmox Atlas
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {mustChangePassword
              ? "Please set a new password for your admin account"
              : "Sign in to access your infrastructure dashboard"
            }
          </p>
        </div>

        {/* Error */}
        {displayError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            {displayError}
          </div>
        )}

        {!mustChangePassword ? (
          /* ===== LOGIN FORM ===== */
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.4rem',
                fontWeight: 500
              }}>Username</label>
              <input
                id="login-username"
                type="text"
                className="search-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.4rem',
                fontWeight: 500
              }}>Password</label>
              <input
                id="login-password"
                type="password"
                className="search-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username || !password}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: loading ? 'wait' : 'pointer'
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          /* ===== CHANGE PASSWORD FORM ===== */
          <form onSubmit={handleChangePassword}>
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--accent)'
            }}>
              🔒 First login detected. You must set a new password to continue.
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.4rem',
                fontWeight: 500
              }}>New Password</label>
              <input
                id="new-password"
                type="password"
                className="search-input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.4rem',
                fontWeight: 500
              }}>Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                className="search-input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              id="change-password-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading || !newPassword || !confirmPassword}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: loading ? 'wait' : 'pointer'
              }}
            >
              {loading ? "Setting password..." : "Set New Password & Continue"}
            </button>
          </form>
        )}

        <p style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          marginTop: '2rem',
          marginBottom: 0,
          opacity: 0.5
        }}>
          Proxmox Atlas — Multi-Cluster Monitoring
        </p>
      </div>
    </div>
  );
}
