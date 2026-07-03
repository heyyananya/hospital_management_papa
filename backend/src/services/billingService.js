/**
 * Billing service - manages charges on a visit.
 *
 * Conventions:
 *  - service_name and price are snapshotted into visit_charges so that
 *    later edits to the price master never rewrite past bills.
 *  - NEW_CASE / OLD_CASE codes are auto-charged when the corresponding
 *    visit is created (see autoAddCaseTypeCharge).
 */
const { pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

const list = async (visitId) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.service_id AS "serviceId", c.service_name AS "serviceName",
            c.price, c.quantity, c.created_at AS "createdAt",
            u.full_name AS "createdByName"
       FROM visit_charges c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.visit_id = $1
      ORDER BY c.created_at ASC`,
    [visitId]
  );
  const total = rows.reduce((sum, r) => sum + Number(r.price) * Number(r.quantity), 0);
  return { items: rows, total };
};

const add = async (visitId, body, user) => {
  if (!body.serviceId && !body.serviceName) {
    throw new HttpError(400, 'serviceId or serviceName is required');
  }
  if (body.price === undefined || body.price === null || isNaN(Number(body.price))) {
    throw new HttpError(400, 'price is required');
  }

  let serviceName = body.serviceName;
  let price = Number(body.price);
  let serviceId = body.serviceId || null;

  // If a master service is referenced, snapshot its current name + price.
  if (serviceId) {
    const { rows } = await pool.query(
      `SELECT name, price FROM service_master WHERE id = $1 AND is_active = TRUE`,
      [serviceId]
    );
    if (!rows[0]) throw new HttpError(404, 'Service not found');
    serviceName = serviceName || rows[0].name;
    if (body.price === undefined) price = Number(rows[0].price);
  }

  const { rows } = await pool.query(
    `INSERT INTO visit_charges (visit_id, service_id, service_name, price, quantity, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, service_id AS "serviceId", service_name AS "serviceName",
               price, quantity, created_at AS "createdAt"`,
    [visitId, serviceId, serviceName, price, body.quantity || 1, user.id]
  );
  return rows[0];
};

const remove = async (chargeId) => {
  const { rowCount } = await pool.query(`DELETE FROM visit_charges WHERE id = $1`, [chargeId]);
  if (!rowCount) throw new HttpError(404, 'Charge not found');
};

/**
 * Adds the auto charge for the case type at visit-creation time.
 * Runs inside the caller's transaction (so it rolls back on visit failure).
 * Silently no-ops if the master service is missing or inactive.
 */
const autoAddCaseTypeCharge = async (client, visitId, caseType, userId) => {
  const code = caseType === 'NEW' ? 'NEW_CASE' : 'OLD_CASE';
  const { rows } = await client.query(
    `SELECT id, name, price FROM service_master
      WHERE code = $1 AND is_active = TRUE`,
    [code]
  );
  if (!rows[0]) return;
  await client.query(
    `INSERT INTO visit_charges (visit_id, service_id, service_name, price, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [visitId, rows[0].id, rows[0].name, rows[0].price, userId]
  );
};

/**
 * Returns the visit's consultation line (the NEW_CASE / OLD_CASE charge)
 * along with the current master default price. Used by the print flow so
 * the receipt editor can pre-fill the amount and we can reset it after.
 */
const getConsultationCharge = async (visitId) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.service_id AS "serviceId", c.service_name AS "serviceName",
            c.price, c.quantity,
            s.code AS "serviceCode", s.price AS "defaultPrice"
       FROM visit_charges c
       JOIN service_master s ON s.id = c.service_id
      WHERE c.visit_id = $1
        AND s.code IN ('NEW_CASE', 'OLD_CASE')
      ORDER BY c.created_at ASC
      LIMIT 1`,
    [visitId]
  );
  return rows[0] || null;
};

/**
 * Returns the non-consultation charges (ECG, Injection, ...).
 */
const getOtherCharges = async (visitId) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.service_id AS "serviceId", c.service_name AS "serviceName",
            c.price, c.quantity
       FROM visit_charges c
       LEFT JOIN service_master s ON s.id = c.service_id
      WHERE c.visit_id = $1
        AND (s.code IS NULL OR s.code NOT IN ('NEW_CASE', 'OLD_CASE'))
      ORDER BY c.created_at ASC`,
    [visitId]
  );
  return rows;
};

/**
 * Resets the consultation charge for a visit back to the current master
 * default price. Called automatically after a (possibly edited) consultation
 * bill is printed — keeps the per-visit price aligned with the master.
 */
const resetConsultationPrice = async (visitId) => {
  const { rowCount } = await pool.query(
    `UPDATE visit_charges c
        SET price = s.price
       FROM service_master s
      WHERE c.service_id = s.id
        AND c.visit_id = $1
        AND s.code IN ('NEW_CASE', 'OLD_CASE')`,
    [visitId]
  );
  return rowCount;
};

module.exports = {
  list, add, remove,
  autoAddCaseTypeCharge,
  getConsultationCharge,
  getOtherCharges,
  resetConsultationPrice,
};
