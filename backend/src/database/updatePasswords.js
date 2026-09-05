/**
 * Updates or ensures admin, reception, and mo users with password '123456'.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const env = require('../config/env');

async function updatePasswords() {
  const hash = await bcrypt.hash('123456', env.BCRYPT_ROUNDS || 12);

  // 1. Admin
  await pool.query(
    `INSERT INTO users (username, password_hash, password_plain, full_name, role, is_active)
     VALUES ('admin', $1, '123456', 'Dr. Ajit Patel', 'ADMIN', TRUE)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = $1,
       password_plain = '123456',
       full_name = 'Dr. Ajit Patel',
       is_active = TRUE`,
    [hash]
  );

  // 2. Reception
  const recRes = await pool.query(`SELECT id FROM users WHERE LOWER(username) = 'reception'`);
  if (recRes.rows.length > 0) {
    await pool.query(
      `UPDATE users 
       SET username = 'reception', password_hash = $1, password_plain = '123456', is_active = TRUE 
       WHERE id = $2`,
      [hash, recRes.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO users (username, password_hash, password_plain, full_name, role, is_active)
       VALUES ('reception', $1, '123456', 'Receptionist', 'RECEPTIONIST', TRUE)`,
      [hash]
    );
  }

  // 3. Medical Officer (MO)
  const moRes = await pool.query(`SELECT id FROM users WHERE LOWER(username) IN ('mo', 'mo@123')`);
  if (moRes.rows.length > 0) {
    await pool.query(
      `UPDATE users 
       SET username = 'mo', password_hash = $1, password_plain = '123456', is_active = TRUE 
       WHERE id = $2`,
      [hash, moRes.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO users (username, password_hash, password_plain, full_name, role, is_active)
       VALUES ('mo', $1, '123456', 'Medical Officer', 'MEDICAL_OFFICER', TRUE)`,
      [hash]
    );
  }

  const { rows } = await pool.query(
    `SELECT id, username, full_name, role, is_active, password_plain FROM users ORDER BY id`
  );
  console.log('[updatePasswords] Done. Users in database:');
  console.table(rows);
}

updatePasswords()
  .catch((err) => {
    console.error('[updatePasswords] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
