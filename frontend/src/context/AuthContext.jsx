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

import LockOverlay from '../components/LockOverlay.jsx';

const LOCKED_KEY = 'dcms.isLocked';

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readUser());
  const [booting, setBooting] = useState(true);
  const [isLocked, setIsLocked] = useState(() => STORE.getItem(LOCKED_KEY) === 'true');

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
        STORE.removeItem(LOCKED_KEY);
        setUser(null);
        setIsLocked(false);
      })
      .finally(() => setBooting(false));
  }, []);

  const login = async (username, password) => {
    const { token, user: u } = await authApi.login({ username, password });
    STORE.setItem(TOKEN_KEY, token);
    STORE.setItem(USER_KEY, JSON.stringify(u));
    STORE.removeItem(LOCKED_KEY);
    setUser(u);
    setIsLocked(false);
    return u;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch (_e) { /* ignore */ }
    STORE.removeItem(TOKEN_KEY);
    STORE.removeItem(USER_KEY);
    STORE.removeItem(LOCKED_KEY);
    // Also clear any residual localStorage from prior installs.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setIsLocked(false);
    navigate('/login', { replace: true });
  };

  const unlockSession = () => {
    STORE.removeItem(LOCKED_KEY);
    setIsLocked(false);
  };

  // Screen Lock after 5 minutes of inactivity (no mouse, keyboard, or touch events)
  useEffect(() => {
    if (!user || isLocked) return;
    const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    let timer;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        STORE.setItem(LOCKED_KEY, 'true');
        setIsLocked(true);
      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [user, isLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ user, login, logout, booting, isLocked, unlockSession }),
    [user, booting, isLocked]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {user && isLocked && (
        <LockOverlay
          user={user}
          onUnlock={unlockSession}
          onLogout={logout}
        />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
