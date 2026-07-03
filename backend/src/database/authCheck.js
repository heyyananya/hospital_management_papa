/**
 * Login diagnostic - skips HTTP and tests every layer directly:
 *   1) Can we reach the DB?
 *   2) Does the admin user exist? Is it active?
 *   3) Does bcrypt.compare succeed for the password in .env?
 *
 * Usage:  npm run auth:check
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const env = require('../config/env');

(async () => {
  const username = env.ADMIN.username;
  const password = env.ADMIN.password;

  console.log('---------------------------------------------');
  console.log(' Auth diagnostic');
  console.log('---------------------------------------------');
  console.log(' DB:        ', `${env.PG.host}:${env.PG.port}/${env.PG.database}`);
  console.log(' Username:  ', username);
  console.log(' Password:  ', JSON.stringify(password), `(${password.length} chars)`);
  console.log('---------------------------------------------');

  try {
    // 1) DB reachable?
    await pool.query('SELECT 1');
    console.log('[1] DB connect ........................ OK');

    // 2) User row?
    const { rows } = await pool.query(
      `SELECT id, username, password_hash, full_name, role, is_active
         FROM users WHERE username = $1`,
      [username]
    );
    const user = rows[0];
    if (!user) {
      console.log('[2] User row .......................... MISSING');
      console.log('    Run: npm run admin:reset');
      return;
    }
    console.log('[2] User row .......................... OK');
    console.log('    id        :', user.id);
    console.log('    role      :', user.role);
    console.log('    is_active :', user.is_active);
    console.log('    hash      :', user.password_hash.slice(0, 20) + '...');

    if (!user.is_active) {
      console.log('    User is INACTIVE - login will fail. Run admin:reset to re-enable.');
      return;
    }

    // 3) Password check
    const ok = await bcrypt.compare(password, user.password_hash);
    console.log('[3] bcrypt.compare ....................', ok ? 'MATCH ✓' : 'NO MATCH ✗');

    if (!ok) {
      console.log('');
      console.log('   The hash in the DB does not match the password in .env.');
      console.log('   Either:');
      console.log('     (a) Change ADMIN_PASSWORD in .env to the password you remember, OR');
      console.log('     (b) Run: npm run admin:reset   (overwrites hash from .env value)');
    } else {
      console.log('');
      console.log('   Credentials are VALID at the DB level.');
      console.log('   If the browser still says "Invalid credentials":');
      console.log('     - Make sure the backend (npm run dev) is running on :5000');
      console.log('     - Open browser DevTools → Network → click the failing /api/auth/login');
      console.log('       request and share the response body / status code.');
    }
  } catch (err) {
    console.log('FAILED:', err.message);
    if (err.code === 'ECONNREFUSED') console.log('PostgreSQL is not running, or PGHOST/PGPORT in .env is wrong.');
    if (err.code === '28P01')        console.log('Wrong PGPASSWORD in .env.');
    if (err.code === '3D000')        console.log('Database does not exist. Run: npm run db:create');
  } finally {
    await pool.end();
  }
})();
