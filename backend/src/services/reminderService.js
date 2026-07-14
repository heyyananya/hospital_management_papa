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

// Idempotent bootstrap so existing DBs pick up the completion + recurrence
// columns on first use without needing a manual `npm run init`.
let completedColsEnsured = false;
const ensureCompletedCols = async () => {
  if (completedColsEnsured) return;
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id)`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_day_of_month INTEGER`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_every_months INTEGER`);
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
         r.recurrence_day_of_month AS "recurrenceDayOfMonth",
         r.recurrence_every_months AS "recurrenceEveryMonths",
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
    // Non-recurring rows: current time inside [starts_at, ends_at].
    // Recurring rows: today is inside the window AND today's day-of-month
    // matches the rule AND the calendar-month delta from starts_at is a
    // multiple of the interval.
    where.push(`r.completed_at IS NULL`);
    where.push(`(
      (r.recurrence_day_of_month IS NULL AND NOW() BETWEEN r.starts_at AND r.ends_at)
      OR (
        r.recurrence_day_of_month IS NOT NULL
        AND CURRENT_DATE BETWEEN r.starts_at::date AND r.ends_at::date
        AND EXTRACT(DAY   FROM CURRENT_DATE) = LEAST(
          r.recurrence_day_of_month,
          EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE)
                          + INTERVAL '1 month' - INTERVAL '1 day'))
        )
        AND MOD(
          (EXTRACT(YEAR  FROM CURRENT_DATE)::int * 12 + EXTRACT(MONTH FROM CURRENT_DATE)::int)
          - (EXTRACT(YEAR  FROM r.starts_at)::int * 12 + EXTRACT(MONTH FROM r.starts_at)::int),
          GREATEST(r.recurrence_every_months, 1)
        ) = 0
      )
    )`);
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

// Clamps a recurrence field to a sane range and returns null if the input
// is missing / invalid — so a plain non-recurring create stays non-recurring.
const clampRecurrence = (dayOfMonth, everyMonths) => {
  const dom = parseInt(dayOfMonth, 10);
  const em  = parseInt(everyMonths, 10);
  if (!Number.isFinite(dom) || !Number.isFinite(em)) return { dom: null, em: null };
  const clampedDom = Math.min(31, Math.max(1, dom));
  const clampedEm  = Math.min(24, Math.max(1, em));
  return { dom: clampedDom, em: clampedEm };
};

const create = async ({
  text, type, targetRoles, startsAt, endsAt,
  recurrenceDayOfMonth, recurrenceEveryMonths,
}, user) => {
  const t = (text || '').trim();
  if (!t) throw new HttpError(400, 'text is required');
  validateWindow(startsAt, endsAt);
  const typ = normalizeType(type);
  const roles = normalizeRoles(targetRoles);
  const { dom, em } = clampRecurrence(recurrenceDayOfMonth, recurrenceEveryMonths);
  const { rows } = await pool.query(
    `INSERT INTO reminders (
       text, type, target_roles, starts_at, ends_at, created_by,
       recurrence_day_of_month, recurrence_every_months
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [t, typ, roles, startsAt, endsAt, user.id, dom, em]
  );
  return get(rows[0].id);
};

const update = async (id, {
  text, type, targetRoles, startsAt, endsAt,
  recurrenceDayOfMonth, recurrenceEveryMonths,
}) => {
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
  // Recurrence: null / omitted → keep existing, "clear" → passes both as null
  // via the clampRecurrence branch below.
  if (recurrenceDayOfMonth !== undefined || recurrenceEveryMonths !== undefined) {
    const { dom, em } = clampRecurrence(recurrenceDayOfMonth, recurrenceEveryMonths);
    set.push(`recurrence_day_of_month = $${i++}`); params.push(dom);
    set.push(`recurrence_every_months = $${i++}`); params.push(em);
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
