/**
 * Users CRUD (admin only).
 */
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');
const { required, ensureEnum } = require('../utils/validators');

const ROLES = ['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'];

const list = async () => {
  const { rows } = await pool.query(
    `SELECT id, username, full_name AS "fullName", role, is_active AS "isActive",
            permissions, password_plain AS "passwordPlain",
            created_at AS "createdAt"
       FROM users ORDER BY id ASC`
  );
  return rows;
};

const create = async (body) => {
  required(body, ['username', 'password', 'fullName', 'role']);
  ensureEnum(body.role, ROLES, 'role');
  const hash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, password_plain, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, full_name AS "fullName", role, is_active AS "isActive",
               password_plain AS "passwordPlain"`,
    [body.username.trim(), hash, body.password, body.fullName.trim(), body.role]
  );
  return rows[0];
};

const update = async (id, body) => {
  const fields = [];
  const values = [];
  let i = 1;
  if (body.fullName) { fields.push(`full_name = $${i++}`); values.push(body.fullName); }
  if (body.role) {
    ensureEnum(body.role, ROLES, 'role');
    fields.push(`role = $${i++}`); values.push(body.role);
  }
  if (typeof body.isActive === 'boolean') { fields.push(`is_active = $${i++}`); values.push(body.isActive); }
  if (body.password) {
    const hash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    fields.push(`password_hash = $${i++}`);
    values.push(hash);
    fields.push(`password_plain = $${i++}`);
    values.push(body.password);
  }
  // permissions: pass an array to set / restrict a user's rights, or null to
  // fall back to role defaults. Undefined means "leave unchanged".
  if (body.permissions !== undefined) {
    fields.push(`permissions = $${i++}`);
    values.push(body.permissions === null ? null : JSON.stringify(body.permissions));
  }
  if (!fields.length) throw new HttpError(400, 'Nothing to update');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, username, full_name AS "fullName", role,
               is_active AS "isActive", permissions,
               password_plain AS "passwordPlain"`,
    values
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return rows[0];
};

const remove = async (id) => {
  // Soft delete by deactivating (we never hard-delete user accounts).
  const { rowCount } = await pool.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [id]);
  if (!rowCount) throw new HttpError(404, 'User not found');
};

module.exports = { list, create, update, remove };
