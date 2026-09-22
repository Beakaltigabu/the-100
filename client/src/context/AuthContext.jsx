import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Mid-session expiry (e.g. token version bumped by a password reset): clear
  // the user so ProtectedRoute bounces to /login instead of looping on toasts.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/me');
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const register = useCallback(async (data) => {
    await api.post('/api/auth/register', data);
    return refresh();
  }, [refresh]);

  const login = useCallback(async (data) => {
    await api.post('/api/auth/login', data);
    return refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // still clear the local session even if the server call fails
    }
    // Drop the onboarding draft so a different account (or a re-registration
    // after deletion) never inherits the previous user's answers/goal.
    try {
      localStorage.removeItem('the100_draft');
    } catch {
      // localStorage unavailable — nothing to clear
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, register, login, logout, refresh }),
    [user, loading, register, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}