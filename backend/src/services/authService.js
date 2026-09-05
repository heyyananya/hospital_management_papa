/**
 * Authentication service.
 */
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const jwt = require('../utils/jwt');
const HttpError = require('../utils/HttpError');

// Idempotent — same pattern as ipdService/billsService. Guarantees the
// permissions column is there even if the operator never ran `npm run init`.
let permsMigrated = false;
const ensurePermissions = async () => {
  if (permsMigrated) return;
  try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB`); }
  catch (e) { console.error('[users migration]', e.message); }
  try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain TEXT`); }
  catch (e) { console.error('[users migration]', e.message); }
  permsMigrated = true;
};

const login = async ({ username, password }) => {
  await ensurePermissions();
  const cleanUsername = (username || '').trim();
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, full_name, role, is_active, permissions
       FROM users WHERE LOWER(username) = LOWER($1)`,
    [cleanUsername]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  // permissions travels in the user payload (NOT the JWT) so the UI can gate
  // the sidebar and routes. Server RBAC still enforces role — this is purely
  // a UI overlay set by the admin.
  const payload = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    permissions: user.permissions || null,
  };
  const token = jwt.sign({ id: payload.id, username: payload.username, role: payload.role });
  return { token, user: payload };
};

const me = async (userId) => {
  await ensurePermissions();
  const { rows } = await pool.query(
    `SELECT id, username, full_name AS "fullName", role, permissions
       FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return rows[0];
};

/**
 * Re-verify the caller's password. Used by sensitive UI actions (e.g. the
 * "reveal password" button in the Users dialog) to make sure the person
 * actually holding the browser is the one authorised on this session.
 * Throws 401 on mismatch — never leaks whether the user exists / is active.
 */
const verifyPassword = async (userId, password) => {
  if (!password) throw new HttpError(400, 'Password required');
  const { rows } = await pool.query(
    `SELECT password_hash, is_active FROM users WHERE id = $1`, [userId]
  );
  const u = rows[0];
  if (!u || !u.is_active) throw new HttpError(401, 'Verification failed');
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) throw new HttpError(401, 'Verification failed');
  return { ok: true };
};

module.exports = { login, me, verifyPassword };
