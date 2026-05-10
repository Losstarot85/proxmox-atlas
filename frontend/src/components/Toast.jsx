/**
 * Toast Notification System — Proxmox Atlas
 *
 * React Context + hook for stackable toast notifications.
 * Supports: success, error, warning, info types.
 * Features: auto-dismiss with progress bar, manual dismiss, confirm dialogs.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Cluster added!");
 *   toast.error("Connection failed");
 *   toast.confirm("Delete user?", { onConfirm: () => deleteUser(id) });
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";
import "./Toast.css";
const ToastContext = createContext(null);

let _nextId = 0;

/**
 * ToastProvider — Wrap your app with this to enable toasts.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after exit animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback(
    (type, message, options = {}) => {
      const id = ++_nextId;
      const duration = options.duration ?? 5000;
      const toast = {
        id,
        type,
        message,
        duration,
        exiting: false,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        // Cap at 5 visible toasts — remove oldest if over limit
        const next = [...prev, toast];
        if (next.length > 5) next.shift();
        return next;
      });

      // Auto-dismiss
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss]
  );

  const success = useCallback((msg, opts) => addToast("success", msg, opts), [addToast]);
  const error = useCallback((msg, opts) => addToast("error", msg, { duration: 8000, ...opts }), [addToast]);
  const warning = useCallback((msg, opts) => addToast("warning", msg, opts), [addToast]);
  const info = useCallback((msg, opts) => addToast("info", msg, opts), [addToast]);

  /**
   * Show a confirm dialog — returns a Promise<boolean>.
   * Replaces browser's native confirm().
   */
  const confirm = useCallback(
    (message, options = {}) => {
      return new Promise((resolve) => {
        setConfirmDialog({
          message,
          confirmLabel: options.confirmLabel || "Confirm",
          cancelLabel: options.cancelLabel || "Cancel",
          type: options.type || "warning",
          onConfirm: () => {
            setConfirmDialog(null);
            resolve(true);
          },
          onCancel: () => {
            setConfirmDialog(null);
            resolve(false);
          },
        });
      });
    },
    []
  );

  const contextValue = { success, error, warning, info, confirm, dismiss };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </ToastContext.Provider>
  );
}

/**
 * useToast hook — access toast functions from any component.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ══════════════════════════════════════════════════════════════════════
   Toast Container — renders stacked toasts in bottom-right
   ══════════════════════════════════════════════════════════════════════ */

const ICONS = {
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path d="M6 10.5L8.5 13L14 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path d="M7 7L13 13M13 7L7 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path d="M10 6V11M10 13.5V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path d="M10 9V14M10 6.5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="log" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { id, type, message, duration, exiting } = toast;

  return (
    <div
      className={`toast-item toast-${type} ${exiting ? "toast-exit" : "toast-enter"}`}
      role="alert"
    >
      <div className="toast-icon">{ICONS[type]}</div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={() => onDismiss(id)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {duration > 0 && (
        <div className="toast-progress">
          <div
            className="toast-progress-bar"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Confirm Dialog — replaces native confirm()
   ══════════════════════════════════════════════════════════════════════ */

function ConfirmDialog({ message, confirmLabel, cancelLabel, type, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className={`confirm-dialog confirm-${type}`} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">{ICONS[type]}</div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="confirm-btn confirm-btn-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
