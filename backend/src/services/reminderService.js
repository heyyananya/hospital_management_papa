/**
 * Admin reminders. Each reminder has a text body and a time window
 * (starts_at..ends_at). While "now" lies inside that window the reminder
 * is considered active — that's what the bell badge counts and what the
 * login popup shows.
 */
const { pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

const TYPES = new Set(['SHORT_TERM', 'LONG_TERM']);
const ROLES = new Set(['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER']);

// Idempotent bootstrap so existing DBs pick up the completion columns on
// first use without needing a manual `npm run init`.
let completedColsEnsured = false;
const ensureCompletedCols = async () => {
  if (completedColsEnsured) return;
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id)`);
  completedColsEnsured = true;
};

const SELECT = `
  SELECT r.id, r.text, r.type, r.target_roles AS "targetRoles",
         r.starts_at    AS "startsAt",
         r.ends_at      AS "endsAt",
         r.created_by   AS "createdBy",
         r.created_at   AS "createdAt",
         r.completed_at AS "completedAt",
         r.completed_by AS "completedBy",
         u.full_name    AS "createdByName",
         cu.full_name   AS "completedByName"
    FROM reminders r
    LEFT JOIN users u  ON u.id  = r.created_by
    LEFT JOIN users cu ON cu.id = r.completed_by
   WHERE r.deleted_at IS NULL
`;

/**
 * @param {object} opts
 * @param {boolean} [opts.activeOnly]  filter to currently-active window
 * @param {string}  [opts.viewerRole]  if set, only reminders that target this
 *                                     role are returned. Omit for "show all"
 *                                     (admin management view).
 */
const list = async ({ activeOnly = false, viewerRole } = {}) => {
  await ensureCompletedCols();
  const where = [];
  const params = [];
  if (activeOnly) {
    where.push('NOW() BETWEEN r.starts_at AND r.ends_at');
    // Completed reminders drop out of the "active" feed even if their
    // window hasn't closed yet — the admin has already ticked them off.
    where.push('r.completed_at IS NULL');
  }
  if (viewerRole) {
    params.push(viewerRole);
    where.push(`$${params.length} = ANY(r.target_roles)`);
  }
  const sql = `${SELECT}
    ${where.length ? 'AND ' + where.join(' AND ') : ''}
    ORDER BY r.starts_at DESC, r.id DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
};

const get = async (id) => {
  await ensureCompletedCols();
  const { rows } = await pool.query(`${SELECT} AND r.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Reminder not found');
  return rows[0];
};

/** Normalise the role list. ADMIN is always pinned so the author still sees it. */
const normalizeRoles = (input) => {
  const arr = Array.isArray(input) ? input : (input ? [input] : []);
  const cleaned = arr
    .map((r) => String(r || '').toUpperCase().trim())
    .filter((r) => ROLES.has(r));
  const set = new Set(cleaned);
  set.add('ADMIN');
  return Array.from(set);
};

const validateWindow = (startsAt, endsAt) => {
  if (!startsAt || !endsAt) {
    throw new HttpError(400, 'startsAt and endsAt are required');
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new HttpError(400, 'endsAt must be after startsAt');
  }
};

const normalizeType = (type) => {
  const t = (type || 'SHORT_TERM').toString().toUpperCase();
  if (!TYPES.has(t)) throw new HttpError(400, 'type must be SHORT_TERM or LONG_TERM');
  return t;
};

const create = async ({ text, type, targetRoles, startsAt, endsAt }, user) => {
  const t = (text || '').trim();
  if (!t) throw new HttpError(400, 'text is required');
  validateWindow(startsAt, endsAt);
  const typ = normalizeType(type);
  const roles = normalizeRoles(targetRoles);
  const { rows } = await pool.query(
    `INSERT INTO reminders (text, type, target_roles, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [t, typ, roles, startsAt, endsAt, user.id]
  );
  return get(rows[0].id);
};

const update = async (id, { text, type, targetRoles, startsAt, endsAt }) => {
  const set = [];
  const params = [];
  let i = 1;
  if (text !== undefined) {
    const t = (text || '').trim();
    if (!t) throw new HttpError(400, 'text cannot be empty');
    set.push(`text = $${i++}`); params.push(t);
  }
  if (type !== undefined) {
    set.push(`type = $${i++}`); params.push(normalizeType(type));
  }
  if (targetRoles !== undefined) {
    set.push(`target_roles = $${i++}`); params.push(normalizeRoles(targetRoles));
  }
  if (startsAt !== undefined || endsAt !== undefined) {
    // If either edge moves, require both so we can validate ordering.
    const current = await get(id);
    const newStart = startsAt ?? current.startsAt;
    const newEnd   = endsAt   ?? current.endsAt;
    validateWindow(newStart, newEnd);
    set.push(`starts_at = $${i++}`); params.push(newStart);
    set.push(`ends_at   = $${i++}`); params.push(newEnd);
  }
  if (!set.length) throw new HttpError(400, 'Nothing to update');
  params.push(id);
  const { rowCount } = await pool.query(
    `UPDATE reminders SET ${set.join(', ')} WHERE id = $${i} AND deleted_at IS NULL`,
    params
  );
  if (!rowCount) throw new HttpError(404, 'Reminder not found');
  return get(id);
};

const remove = async (id) => {
  const { rowCount } = await pool.query(
    `UPDATE reminders SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!rowCount) throw new HttpError(404, 'Reminder not found');
};

/**
 * Admin marks the reminder as done. Idempotent: a second call is a no-op.
 * Distinct from remove() — the row stays visible in the reminders table
 * (with a "Completed" chip) so the admin has an audit trail of what was
 * actually finished.
 */
const complete = async (id, user) => {
  await ensureCompletedCols();
  const { rowCount } = await pool.query(
    `UPDATE reminders
        SET completed_at = COALESCE(completed_at, NOW()),
            completed_by = COALESCE(completed_by, $2)
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, user?.id || null]
  );
  if (!rowCount) throw new HttpError(404, 'Reminder not found');
  return get(id);
};

/** Reopen a completed reminder — clears completed_at/by. */
const uncomplete = async (id) => {
  await ensureCompletedCols();
  const { rowCount } = await pool.query(
    `UPDATE reminders
        SET completed_at = NULL, completed_by = NULL
      WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!rowCount) throw new HttpError(404, 'Reminder not found');
  return get(id);
};

module.exports = { list, get, create, update, remove, complete, uncomplete };
