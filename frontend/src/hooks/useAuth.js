import { useState, useCallback, useEffect } from "react";

const TOKEN_KEY = "atlas-auth-token";

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const isAuthenticated = !!token && !mustChangePassword;

  const login = useCallback(async (username, password) => {
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Invalid credentials");
      }
      const data = await res.json();
      if (data.must_change_password) {
        // Store token temporarily for the change-password call
        setToken(data.token);
        setMustChangePassword(true);
      } else {
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setMustChangePassword(false);
      }
      return true;
    } catch (err) {
      setLoginError(err.message);
      return false;
    }
  }, []);

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
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
  }, [token]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMustChangePassword(false);
    setLoginError(null);
  }, []);

  // Global fetch override to inject Bearer token into all API calls and handle 401s
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
      
      // Only intercept our own API calls, excluding the login endpoint which shouldn't have tokens
      if (url.startsWith('/api') && !url.includes('/api/auth/login')) {
        const currentToken = localStorage.getItem(TOKEN_KEY);
        if (currentToken) {
          init.headers = {
            ...init.headers,
            'Authorization': `Bearer ${currentToken}`
          };
        }
      }

      const response = await originalFetch(input, init);

      if (response.status === 401 && url.startsWith('/api') && !url.includes('/api/auth/login')) {
        console.warn("API returned 401 Unauthorized, automatically logging out.");
        logout();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);

  return {
    token,
    isAuthenticated,
    mustChangePassword,
    loginError,
    login,
    changePassword,
    logout
  };
}
