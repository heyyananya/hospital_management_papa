/**
 * App settings (clinic name, doctor name, receipt footer, etc.).
 * Stored as key/value rows so we can add new settings without migrations.
 */
const { pool } = require('../config/db');

const KNOWN_KEYS = [
  'clinic_name',
  'doctor_name',
  'clinic_address',
  'clinic_phone',
  'receipt_footer',
];

const getAll = async () => {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings ORDER BY key ASC`
  );
  // Map to a flat object, defaulting any missing known keys to ''.
  const out = Object.fromEntries(KNOWN_KEYS.map((k) => [k, '']));
  rows.forEach((r) => { out[r.key] = r.value || ''; });
  return out;
};

const get = async (key) => {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key]
  );
  return rows[0]?.value ?? null;
};

const updateMany = async (patch, user) => {
  const entries = Object.entries(patch).filter(([k]) => KNOWN_KEYS.includes(k));
  for (const [k, v] of entries) {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
      [k, v ?? '', user.id]
    );
  }
  return getAll();
};

module.exports = { getAll, get, updateMany, KNOWN_KEYS };
