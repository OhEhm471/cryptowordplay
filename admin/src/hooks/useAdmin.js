import { useState, useEffect, useCallback } from "react";
import { adminApi } from "../lib/api";

export function useAdmin() {
  const [token,     setToken]     = useState(() => localStorage.getItem("cwp_admin_token") || "");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError,  setLoginError]  = useState("");

  const isAuthed = !!token;

  const login = useCallback(async (secret) => {
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const data = await adminApi.login(secret);
      if (data.token) {
        localStorage.setItem("cwp_admin_token", data.token);
        setToken(data.token);
        return true;
      }
      setLoginError(data.error || "Invalid credentials");
      return false;
    } catch {
      setLoginError("Login failed — check the admin secret");
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("cwp_admin_token");
    setToken("");
  }, []);

  return { isAuthed, isLoggingIn, loginError, login, logout };
}

// Generic data-fetching hook used by each screen
export function useAdminFetch(fetchFn, deps = []) {
  const [data,      setData]      = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, error, reload: load };
}
