/**
 * Authentication service.
 */
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const jwt = require('../utils/jwt');
const HttpError = require('../utils/HttpError');

const login = async ({ username, password }) => {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, full_name, role, is_active
       FROM users WHERE username = $1`,
    [username]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  const payload = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
  };
  const token = jwt.sign(payload);
  return { token, user: payload };
};

const me = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, username, full_name AS "fullName", role
       FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return rows[0];
};

module.exports = { login, me };
