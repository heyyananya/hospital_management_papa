/**
 * PostgreSQL pool — the single shared connection pool for the app.
 * Every query in the codebase goes through `pool.query` or the `withTx` helper
 * so that we keep a clean parameterised SQL surface and reliable transactions.
 */
const { Pool } = require('pg');
const env = require('./env');

const isLocal = env.PG.host === 'localhost' || env.PG.host === '127.0.0.1';

const pool = new Pool({
  host: env.PG.host,
  port: env.PG.port,
  user: env.PG.user,
  password: env.PG.password,
  database: env.PG.database,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pg] idle client error:', err.message);
});

/**
 * Run a unit of work inside a transaction. Auto-commits on success,
 * rolls back on any thrown error, and always releases the client.
 */
const withTx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, withTx };
