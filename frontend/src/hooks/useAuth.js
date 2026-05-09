import { useState, useCallback, useEffect } from "react";
import { API_BASE } from "../config";

const TOKEN_KEY = "atlas-auth-token";

/**
 * Decode JWT payload (base64url) without external libraries.
 */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

// ─── Module-level fetch interceptor ────────────────────────────────
// Set up ONCE at import time, outside of React's render cycle.
// This avoids hook ordering issues caused by monkey-patching inside useEffect.
const _originalFetch = window.fetch.bind(window);
let _onUnauthorized = null; // callback registered by useAuth hook

window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";

  // Inject Bearer token for API calls (skip login endpoint)
  if (url.startsWith("/api") && !url.includes("/auth/login")) {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      init.headers = {
        ...init.headers,
        Authorization: `Bearer ${currentToken}`,
      };
    }
  }

  const response = await _originalFetch(input, init);

  // Auto-logout on 401 (skip login endpoint to avoid logout on wrong password)
  if (response.status === 401 && url.startsWith("/api") && !url.includes("/auth/login")) {
    console.warn("API returned 401 Unauthorized, automatically logging out.");
    if (_onUnauthorized) {
      // Defer to avoid triggering state updates during React render cycles
      setTimeout(() => _onUnauthorized(), 0);
    }
  }

  return response;
};

// ─── React Hook ────────────────────────────────────────────────────

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Derive role and username from the stored token
  const payload = token ? decodeJwtPayload(token) : {};
  const userRole = payload.role || "viewer";
  const username = payload.sub || "";

  const isAuthenticated = !!token && !mustChangePassword;

  const login = useCallback(async (user, password) => {
    setLoginError(null);
    try {
      const res = await _originalFetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password }),
      });
      const data = await res.json();

      // Backend returns 200 for both success and failure.
      // Failure is indicated by an `error` field in the response body.
      if (data.error) {
        setLoginError(data.error);
        return false;
      }

      if (data.must_change_password) {
        setToken(data.token);
        setMustChangePassword(true);
      } else {
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setMustChangePassword(false);
      }
      return true;
    } catch (err) {
      setLoginError("Unable to reach the server. Please check your connection and try again.");
      return false;
    }
  }, []);

  const changePassword = useCallback(
    async (oldPassword, newPassword) => {
      setLoginError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Error changing password");
        }
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setMustChangePassword(false);
        return true;
      } catch (err) {
        setLoginError(err.message);
        return false;
      }
    },
    [token]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMustChangePassword(false);
    setLoginError(null);
  }, []);

  const updateToken = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  // Register logout callback for the module-level fetch interceptor
  useEffect(() => {
    _onUnauthorized = logout;
    return () => {
      _onUnauthorized = null;
    };
  }, [logout]);

  return {
    token,
    isAuthenticated,
    mustChangePassword,
    loginError,
    userRole,
    username,
    login,
    changePassword,
    logout,
    updateToken,
  };
}
