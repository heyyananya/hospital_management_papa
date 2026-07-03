/**
 * Database bootstrap script.
 * Reads schema.sql + seed.sql and executes them against the configured DB.
 * Also creates the default admin user from .env.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const env = require('../config/env');

const run = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  console.log('[init] applying schema...');
  await pool.query(schema);

  console.log('[init] seeding masters...');
  await pool.query(seed);

  console.log('[init] ensuring default admin...');
  const passwordHash = await bcrypt.hash(env.ADMIN.password, env.BCRYPT_ROUNDS);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (username) DO NOTHING`,
    [env.ADMIN.username, passwordHash, env.ADMIN.fullName]
  );

  console.log('[init] done.');
  await pool.end();
};

run().catch(async (err) => {
  console.error('[init] failed:', err);
  await pool.end();
  process.exit(1);
});
