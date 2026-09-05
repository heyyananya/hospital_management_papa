/**
 * Creates the application database (dcms) if it does not already exist.
 * Uses the `pg` driver directly — no Prisma, no ORM.
 *
 * It connects to the maintenance database `postgres` (every PG install
 * has one) and runs `CREATE DATABASE <name>` only when needed.
 */
require('dotenv').config();
const { Client } = require('pg');

const env = require('../config/env');

const dbName = env.PG.database;

(async () => {
  const isLocal = env.PG.host === 'localhost' || env.PG.host === '127.0.0.1';
  const isCloud = !isLocal;

  // On cloud databases like Neon, the target database already exists.
  if (isCloud) {
    console.log(`[createDb] Cloud database detected (${env.PG.host}) - skipping database creation.`);
    return;
  }

  // Connect to the built-in `postgres` database to be able to issue CREATE DATABASE.
  const admin = new Client({
    host: env.PG.host,
    port: env.PG.port,
    user: env.PG.user,
    password: env.PG.password,
    database: 'postgres',
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await admin.connect();

    const { rows } = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (rows.length) {
      console.log(`[createDb] database "${dbName}" already exists - skipping.`);
    } else {
      // Identifiers cannot be parameterised, so we whitelist with a regex.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
        throw new Error(`Refusing to create database with unsafe name: "${dbName}"`);
      }
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[createDb] database "${dbName}" created.`);
    }
  } catch (err) {
    console.error('[createDb] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await admin.end();
  }
})();
