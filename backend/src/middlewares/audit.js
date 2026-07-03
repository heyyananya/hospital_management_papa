/**
 * Fire-and-forget audit logger. Called from controllers explicitly
 * after a successful mutation. Keeps the audit trail outside the
 * critical path of the request.
 */
const { pool } = require('../config/db');

const audit = async ({ userId, action, entity, entityId, meta, ip }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, entity, entityId ? String(entityId) : null, meta || null, ip || null]
    );
  } catch (err) {
    // Audit must never break the user's request.
    // eslint-disable-next-line no-console
    console.error('[audit] failed:', err.message);
  }
};

module.exports = audit;
