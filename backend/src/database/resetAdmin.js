/**
 * Reset (or create) the default admin user using values from .env:
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FULLNAME
 *
 * Usage:  npm run admin:reset
 *
 * Safe to run multiple times — re-hashes and writes the password each time.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const env = require('../config/env');

(async () => {
  try {
    const hash = await bcrypt.hash(env.ADMIN.password, env.BCRYPT_ROUNDS);
    const { rowCount } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'ADMIN', TRUE)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name     = EXCLUDED.full_name,
         is_active     = TRUE`,
      [env.ADMIN.username, hash, env.ADMIN.fullName]
    );
    console.log(`[admin:reset] OK - user "${env.ADMIN.username}" password is now "${env.ADMIN.password}" (rows affected: ${rowCount})`);
  } catch (err) {
    console.error('[admin:reset] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
