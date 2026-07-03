import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/endpoints.js';

const AuthContext = createContext(null);

/*
 * We deliberately keep the token in sessionStorage (not localStorage) so
 * the session dies as soon as the tab / window closes. That's what makes
 * the app prompt for a fresh login every time the user opens it — which is
 * the security posture the doctor asked for.
 *
 * The migration read on load (`localStorage.getItem`) is left in so anyone
 * already logged in during rollout isn't forcibly kicked out mid-session:
 * we lift their old token over on first mount and then wipe the legacy key.
 */
const STORE = sessionStorage;
const TOKEN_KEY = 'dcms.token';
const USER_KEY  = 'dcms.user';

const readToken = () => {
  const existing = STORE.getItem(TOKEN_KEY);
  if (existing) return existing;
  // One-shot migration from any prior localStorage-based install.
  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    STORE.setItem(TOKEN_KEY, legacy);
    const lu = localStorage.getItem(USER_KEY);
    if (lu) STORE.setItem(USER_KEY, lu);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return legacy;
  }
  return null;
};

const readUser = () => {
  try { return JSON.parse(STORE.getItem(USER_KEY)); }
  catch { return null; }
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readUser());
  const [booting, setBooting] = useState(true);

  // On first mount, verify the stored token is still valid.
  useEffect(() => {
    const token = readToken();
    if (!token) { setBooting(false); return; }
    authApi.me()
      .then((u) => {
        setUser(u);
        STORE.setItem(USER_KEY, JSON.stringify(u));
      })
      .catch(() => {
        STORE.removeItem(TOKEN_KEY);
        STORE.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, []);

  const login = async (username, password) => {
    const { token, user: u } = await authApi.login({ username, password });
    STORE.setItem(TOKEN_KEY, token);
    STORE.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch (_e) { /* ignore */ }
    STORE.removeItem(TOKEN_KEY);
    STORE.removeItem(USER_KEY);
    // Also clear any residual localStorage from prior installs.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    navigate('/login', { replace: true });
  };

  const value = useMemo(() => ({ user, login, logout, booting }), [user, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
