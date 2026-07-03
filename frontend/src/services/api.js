import axios from 'axios';

/**
 * Single shared Axios instance.
 * Auto-attaches the JWT to every request and bubbles 401s
 * back to the auth context so the user is forced to re-login.
 */
const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
});

/**
 * Read the current JWT. sessionStorage is the primary store (dies with the
 * tab, forcing a re-login next visit); the localStorage fallback exists so
 * a user who was already logged in during rollout isn't kicked out.
 *
 * Callers doing raw `fetch` (PDF blob downloads, etc.) should use this
 * instead of poking localStorage directly.
 */
export const getAuthToken = () =>
  sessionStorage.getItem('dcms.token') || localStorage.getItem('dcms.token');

/** Convenience: header object ready to spread into a `fetch` call. */
export const authHeader = () => {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Token lives in sessionStorage so it dies when the tab / browser is
// closed. We also read localStorage as a fallback for one release cycle
// so an installed browser session isn't forcibly logged out mid-day
// during rollout — AuthContext migrates it over.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('dcms.token') || localStorage.getItem('dcms.token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const here = window.location.pathname;
      if (!here.includes('/login')) {
        sessionStorage.removeItem('dcms.token');
        sessionStorage.removeItem('dcms.user');
        localStorage.removeItem('dcms.token');
        localStorage.removeItem('dcms.user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
