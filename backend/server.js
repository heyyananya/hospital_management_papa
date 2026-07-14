/**
 * Doctor Clinic Management System - Backend entry point.
 * Boots the Express application after verifying DB connectivity.
 */
require('dotenv').config();

const app = require('./src/app');
const { pool } = require('./src/config/db');
const env = require('./src/config/env');

(async () => {
  try {
    // Verify DB connectivity before listening.
    await pool.query('SELECT 1');
    app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[DCMS] Backend listening on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DCMS] Failed to start:', err.message);
    process.exit(1);
  }
})();
// trigger nodemon restart

