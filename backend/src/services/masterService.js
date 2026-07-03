/**
 * Generic CRUD for master tables. Each master shares the same shape
 * (id + name/text/code + is_active), so we expose a single service.
 */
const { pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

// Whitelist of master tables that may be edited via the API.
// `nameCols` lists the column(s) considered the "label" for searching.
const MASTERS = {
  languages:            { table: 'languages',            cols: ['name'],           extras: [] },
  villages:             { table: 'villages',             cols: ['name'],           extras: ['taluka', 'district', 'state'] },
  referrals:            { table: 'referrals',            cols: ['name'],           extras: [] },
  known_disease_master: { table: 'known_disease_master', cols: ['code', 'name'],   extras: [] },
  complaint_master:     { table: 'complaint_master',     cols: ['code', 'name'],   extras: [] },
  investigation_master: { table: 'investigation_master', cols: ['code', 'name'],   extras: [] },
  plan_master:          { table: 'plan_master',          cols: ['code', 'name'],   extras: [] },
  medicine_master:      { table: 'medicine_master',      cols: ['code', 'name'],   extras: ['form'] },
  advice_master:        { table: 'advice_master',        cols: ['text'],           extras: [] },
  examination_master:   { table: 'examination_master',   cols: ['code', 'label'],  extras: [] },
  service_master:       { table: 'service_master',       cols: ['code', 'name'],   extras: ['price'] },
};

const assertKey = (key) => {
  if (!MASTERS[key]) throw new HttpError(404, `Unknown master: ${key}`);
};

const list = async (key, { q, activeOnly = true } = {}) => {
  assertKey(key);
  const { table, cols, extras } = MASTERS[key];
  const params = [];
  const where = [];
  if (activeOnly) where.push('is_active = TRUE');
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(${cols.map((c) => `LOWER(${c}) LIKE $${params.length}`).join(' OR ')})`);
  }
  const sql = `
    SELECT id, ${cols.join(', ')}${extras.length ? ', ' + extras.join(', ') : ''}, is_active AS "isActive"
      FROM ${table}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${cols[0]} ASC`;
  const { rows } = await pool.query(sql, params);
  return rows;
};

const create = async (key, body) => {
  assertKey(key);
  const { table, cols, extras } = MASTERS[key];
  const required = cols;
  required.forEach((c) => {
    if (!body[c]) throw new HttpError(400, `${c} is required`);
  });
  const allCols = [...cols, ...extras];
  const insertCols = allCols.filter((c) => body[c] !== undefined);
  const values = insertCols.map((c) => body[c]);
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
};

const update = async (key, id, body) => {
  assertKey(key);
  const { table, cols, extras } = MASTERS[key];
  const allCols = [...cols, ...extras, 'is_active'];
  const set = [];
  const params = [];
  let i = 1;
  for (const c of allCols) {
    if (body[c] !== undefined) {
      set.push(`${c} = $${i++}`);
      params.push(body[c]);
    }
  }
  if (typeof body.isActive === 'boolean') {
    set.push(`is_active = $${i++}`);
    params.push(body.isActive);
  }
  if (!set.length) throw new HttpError(400, 'Nothing to update');
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE ${table} SET ${set.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows[0]) throw new HttpError(404, 'Not found');
  return rows[0];
};

const remove = async (key, id) => {
  assertKey(key);
  const { table } = MASTERS[key];
  const { rowCount } = await pool.query(
    `UPDATE ${table} SET is_active = FALSE WHERE id = $1`,
    [id]
  );
  if (!rowCount) throw new HttpError(404, 'Not found');
};

module.exports = { list, create, update, remove, MASTERS };
