import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission, PERMISSION_BY_PATH } from '../utils/permissions.js';

/**
 * Gate a sub-tree by authentication + (optional) permission key.
 *
 * Precedence when deciding what to check:
 *   1. Explicit `permission` prop — always wins if passed.
 *   2. Otherwise: derive the permission from the current URL via the
 *      catalog. This means any Route wrapped in <ProtectedRoute> is
 *      auto-gated as long as its path is in utils/permissions.js.
 *   3. If the URL isn't in the catalog either, gate on authentication only
 *      (defence against a partial catalog while adding a new page).
 *
 * The legacy `roles` prop is accepted for backward compatibility but
 * IGNORED — the permission system supersedes it. Admins always pass.
 */
export default function ProtectedRoute({ children, permission /* , roles */ }) {
  const { user, booting } = useAuth();
  const loc = useLocation();

  if (booting) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  const perm = permission || PERMISSION_BY_PATH[loc.pathname]?.key;
  if (perm && !hasPermission(user, perm)) return <Navigate to="/" replace />;
  return children;
}
