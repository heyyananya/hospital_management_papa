/**
 * Bills service.
 *
 * Domain rules (per FEFSA spec):
 *   - Every visit auto-generates ONE Auto bill (BILL-YYYY-NNNNNN).
 *   - Auto bills are READ-ONLY for the lifetime of the system. No edits, no
 *     deletes. They are the hospital's internal financial record.
 *   - Final bills (FBILL-YYYY-NNNNNN) are an editable copy of an Auto bill,
 *     created only when the patient asks for an official printed bill.
 *   - Final bills become LOCKED once "Generate Final Bill" is clicked.
 */
const { pool, withTx } = require('../config/db');
const HttpError = require('../utils/HttpError');

const AUTO_TYPE  = 'AUTO';
const FINAL_TYPE = 'FINAL';
const IPD_TYPE   = 'IPD';

// One-shot idempotent migration so existing installs pick up the IPD-bill
// columns and CHECK constraint without needing `npm run init`. Each step is
// wrapped individually — DROP NOT NULL / DROP CONSTRAINT will no-op if the
// state is already correct, but the wrapper stops one non-fatal hiccup from
// blocking the whole boot.
let ipdBillsMigrated = false;
const ensureIpdBillsMigration = async () => {
  if (ipdBillsMigrated) return;
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch (e) {
      // eslint-disable-next-line no-console
      console.error('[bills migration]', e.message, '::', sql.replace(/\s+/g, ' ').trim());
    }
  };
  // 1. Column first — no FK yet, so it works even if admissions is missing.
  await safe(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS admission_id INTEGER`);
  // 2. FK — only if the constraint isn't there yet (needs admissions to exist).
  await safe(`
    DO $mig$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bills_admission_id_fkey'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_name = 'admissions'
      ) THEN
        ALTER TABLE bills
          ADD CONSTRAINT bills_admission_id_fkey
          FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE;
      END IF;
    END
    $mig$;
  `);
  // 3. Relax visit_id NOT NULL (IPD bills don't have a visit).
  await safe(`ALTER TABLE bills ALTER COLUMN visit_id DROP NOT NULL`);
  // 4. Broaden bill_type CHECK to allow IPD.
  await safe(`ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_type_check`);
  await safe(`ALTER TABLE bills
              ADD CONSTRAINT bills_bill_type_check
              CHECK (bill_type IN ('AUTO','FINAL','IPD'))`);
  // 5. Index.
  await safe(`CREATE INDEX IF NOT EXISTS idx_bills_admission ON bills (admission_id)`);
  ipdBillsMigrated = true;
};

/* ----------------------------- helpers ----------------------------- */

/**
 * Bill numbers follow Financial Year semantics:
 *   BILL-<startY>-<yy>-<n>   e.g. BILL-2026-27-1
 * The counter <n> resets each Apr 1 (start of the new FY).
 *
 * We derive next(n) from MAX + 1 of existing bills that already carry the
 * current FY prefix — that way it's atomic within the caller's transaction
 * and doesn't need a per-FY sequence to be provisioned.
 */
const { currentFY } = require('../utils/financialYear');

const prefixFor = (type) => {
  if (type === FINAL_TYPE) return 'FBILL';
  if (type === IPD_TYPE)   return 'IBILL';
  return 'BILL';
};

const nextBillNumber = async (client, typeOrIsFinal) => {
  // Back-compat: original signature was (client, isFinal) where isFinal is a
  // boolean. Accept a string type too so IPD callers can pass 'IPD'.
  const type = typeof typeOrIsFinal === 'string'
    ? typeOrIsFinal
    : (typeOrIsFinal ? FINAL_TYPE : AUTO_TYPE);
  const prefix = prefixFor(type);
  const fy = currentFY();
  const like = `${prefix}-${fy.key}-%`;
  const { rows } = await client.query(
    `SELECT COALESCE(
       MAX((regexp_match(bill_number, '^${prefix}-[0-9]{4}-[0-9]{2}-([0-9]+)$'))[1]::int),
       0
     ) AS n
       FROM bills
      WHERE bill_number LIKE $1`,
    [like]
  );
  const n = Number(rows[0].n) + 1;
  return `${prefix}-${fy.key}-${n}`;
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const recalcTotals = (services, discount = 0, additional = 0) => {
  const subtotal = services.reduce((s, x) => s + Number(x.unit_price) * Number(x.quantity || 1), 0);
  const total = round2(subtotal - Number(discount || 0) + Number(additional || 0));
  return { subtotal: round2(subtotal), total };
};

const BILL_SELECT = `
  b.id, b.bill_number AS "billNumber", b.bill_type AS "billType",
  b.parent_bill_id AS "parentBillId", b.visit_id AS "visitId",
  b.admission_id AS "admissionId",
  b.patient_id AS "patientId", b.doctor_id AS "doctorId",
  b.case_type AS "caseType", b.status,
  b.subtotal, b.discount, b.additional, b.total,
  b.notes, b.printed_at AS "printedAt",
  b.created_at AS "createdAt", b.updated_at AS "updatedAt"
`;

// IPD bills have no visit — case_number / visit_date fall back to admission
// number / admitted-at so downstream consumers (list UI, PDF receipt) can
// treat every bill row uniformly.
const VISIT_JOIN_SELECT = `
  p.patient_code AS "patientCode",
  (p.first_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.surname) AS "patientName",
  p.mobile, p.gender, p.age, p.village_name AS "village",
  COALESCE(v.case_number::text,
           CASE WHEN a.id IS NOT NULL
                THEN a.fy_key || '/' || a.admission_number::text
                ELSE NULL END)                           AS "caseNumber",
  COALESCE(v.visit_date, a.admitted_at::date)            AS "visitDate",
  COALESCE(TO_CHAR(v.visit_time, 'HH24:MI'),
           TO_CHAR(a.admitted_at, 'HH24:MI'))              AS "visitTime",
  a.admission_number                                     AS "admissionNumber",
  a.fy_key                                               AS "admissionFyKey",
  a.admitted_at                                          AS "admittedAt",
  a.discharged_at                                        AS "dischargedAt",
  a.admission_diagnosis                                  AS "admissionDiagnosis",
  aw.name                                                AS "wardName",
  ab.bed_number                                          AS "bedNumber",
  u.full_name AS "createdByName"
`;

const hydrateServices = async (clientOrPool, billId) => {
  const { rows } = await clientOrPool.query(
    `SELECT id, service_id AS "serviceId", service_name AS "serviceName",
            quantity, unit_price AS "unitPrice", total
       FROM bill_services WHERE bill_id = $1 ORDER BY id ASC`,
    [billId]
  );
  return rows;
};

/* ------------------------- AUTO bill creation ---------------------- */

/**
 * Creates one Auto bill (with the case-type consultation line)
 * inside the caller's transaction. Returns { id, billNumber }.
 *
 * If a service for the case type is missing in service_master, falls
 * back to the hard defaults (NEW=400, OLD=200) so the bill is never empty.
 */
const createAutoBillTx = async (client, { visitId, patientId, caseType, userId, doctorId }) => {
  const code = caseType === 'NEW' ? 'NEW_CASE' : 'OLD_CASE';
  const defaultPrice = caseType === 'NEW' ? 400 : 200;
  const defaultName  = caseType === 'NEW' ? 'Consultation - New Case' : 'Consultation - Old Case';

  const { rows: svc } = await client.query(
    `SELECT id, name, price FROM service_master
      WHERE code = $1 AND is_active = TRUE`,
    [code]
  );
  const service = svc[0] || { id: null, name: defaultName, price: defaultPrice };
  const qty = 1;
  const unitPrice = Number(service.price);
  const lineTotal = round2(unitPrice * qty);

  const billNumber = await nextBillNumber(client, false);

  const { rows: billRows } = await client.query(
    `INSERT INTO bills (
       bill_number, bill_type, visit_id, patient_id, doctor_id,
       case_type, status, subtotal, total, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7, $8)
     RETURNING id`,
    [billNumber, AUTO_TYPE, visitId, patientId, doctorId || null, caseType, lineTotal, userId]
  );
  const billId = billRows[0].id;

  await client.query(
    `INSERT INTO bill_services (bill_id, service_id, service_name, quantity, unit_price, total)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [billId, service.id, service.name, qty, unitPrice, lineTotal]
  );

  return { id: billId, billNumber };
};

/* ------------------------------ Queries ---------------------------- */

const listBills = async ({ billType, q, fromDate, toDate, page = 1, pageSize = 25 }) => {
  await ensureIpdBillsMigration();
  const params = [];
  const where = [];

  if (billType) {
    params.push(billType);
    where.push(`b.bill_type = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const ph = `$${params.length}`;
    where.push(`(LOWER(b.bill_number) LIKE ${ph}
                 OR LOWER(p.patient_code) LIKE ${ph}
                 OR LOWER(p.first_name) LIKE ${ph}
                 OR LOWER(p.surname) LIKE ${ph}
                 OR p.mobile LIKE ${ph})`);
  }
  if (fromDate) {
    params.push(fromDate);
    where.push(`b.created_at::date >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`b.created_at::date <= $${params.length}`);
  }

  const baseFrom = `
    FROM bills b
    JOIN patients p            ON p.id = b.patient_id
    LEFT JOIN patient_visits v ON v.id = b.visit_id
    LEFT JOIN admissions a     ON a.id = b.admission_id
    LEFT JOIN beds ab          ON ab.id = a.bed_id
    LEFT JOIN wards aw         ON aw.id = ab.ward_id
    LEFT JOIN users u          ON u.id = b.created_by
   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;

  const offset = (Math.max(1, page) - 1) * pageSize;
  const lp = params.length + 1;
  const op = params.length + 2;
  const { rows } = await pool.query(
    `SELECT ${BILL_SELECT}, ${VISIT_JOIN_SELECT}
       ${baseFrom}
     ORDER BY b.created_at DESC
     LIMIT $${lp} OFFSET $${op}`,
    [...params, pageSize, offset]
  );

  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS total ${baseFrom}`, params
  );

  return { rows, total: cRows[0].total, page, pageSize };
};

const getBill = async (id) => {
  await ensureIpdBillsMigration();
  const { rows } = await pool.query(
    `SELECT ${BILL_SELECT}, ${VISIT_JOIN_SELECT}
       FROM bills b
       JOIN patients p            ON p.id = b.patient_id
       LEFT JOIN patient_visits v ON v.id = b.visit_id
       LEFT JOIN admissions a     ON a.id = b.admission_id
       LEFT JOIN beds ab          ON ab.id = a.bed_id
       LEFT JOIN wards aw         ON aw.id = ab.ward_id
       LEFT JOIN users u          ON u.id = b.created_by
      WHERE b.id = $1`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Bill not found');
  const bill = rows[0];
  bill.services = await hydrateServices(pool, id);
  return bill;
};

const getByVisitAndType = async (visitId, billType) => {
  const { rows } = await pool.query(
    `SELECT ${BILL_SELECT} FROM bills b
      WHERE b.visit_id = $1 AND b.bill_type = $2
      ORDER BY b.created_at ASC LIMIT 1`,
    [visitId, billType]
  );
  return rows[0] || null;
};

/* -------------------------- Final bill flow ------------------------ */

/**
 * Create a Final bill by copying an Auto bill (with all its services).
 * The Auto bill is left untouched.
 */
const convertToFinal = async (autoBillId, user) => {
  return withTx(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM bills WHERE id = $1 FOR UPDATE`, [autoBillId]
    );
    const auto = aRows[0];
    if (!auto) throw new HttpError(404, 'Auto bill not found');
    if (auto.bill_type !== AUTO_TYPE) throw new HttpError(400, 'Only Auto bills can be converted');

    const billNumber = await nextBillNumber(client, true);
    const { rows: bRows } = await client.query(
      `INSERT INTO bills (
         bill_number, bill_type, parent_bill_id, visit_id, patient_id, doctor_id,
         case_type, status, subtotal, discount, additional, total, notes, created_by
       ) VALUES ($1, 'FINAL', $2, $3, $4, $5, $6, 'ACTIVE', $7, 0, 0, $7, NULL, $8)
       RETURNING id`,
      [billNumber, auto.id, auto.visit_id, auto.patient_id, auto.doctor_id,
       auto.case_type, auto.subtotal, user.id]
    );
    const finalId = bRows[0].id;

    // Copy all service lines.
    await client.query(
      `INSERT INTO bill_services (bill_id, service_id, service_name, quantity, unit_price, total)
       SELECT $1, service_id, service_name, quantity, unit_price, total
         FROM bill_services WHERE bill_id = $2`,
      [finalId, auto.id]
    );

    return { id: finalId, billNumber };
  });
};

/**
 * Update an ACTIVE bill (Auto or Final): services, discount, additional, notes.
 * Recomputes subtotal and total automatically. LOCKED bills are immutable.
 */
const updateFinal = async (billId, body, _user) => {
  return withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM bills WHERE id = $1 FOR UPDATE`, [billId]
    );
    const bill = rows[0];
    if (!bill) throw new HttpError(404, 'Bill not found');
    if (bill.status === 'LOCKED') throw new HttpError(400, 'Bill is locked');

    const discount   = Number(body.discount   ?? bill.discount   ?? 0);
    const additional = Number(body.additional ?? bill.additional ?? 0);
    const notes      = body.notes ?? bill.notes;

    // Replace service lines if provided.
    let services;
    if (Array.isArray(body.services)) {
      await client.query(`DELETE FROM bill_services WHERE bill_id = $1`, [billId]);
      services = [];
      for (const s of body.services) {
        const qty   = Math.max(1, parseInt(s.quantity || 1, 10));
        const price = round2(s.unitPrice ?? s.price ?? 0);
        const total = round2(price * qty);
        await client.query(
          `INSERT INTO bill_services (bill_id, service_id, service_name, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [billId, s.serviceId || null, s.serviceName, qty, price, total]
        );
        services.push({ unit_price: price, quantity: qty });
      }
    } else {
      const cur = await client.query(
        `SELECT unit_price, quantity FROM bill_services WHERE bill_id = $1`, [billId]
      );
      services = cur.rows;
    }

    const totals = recalcTotals(services, discount, additional);

    await client.query(
      `UPDATE bills
          SET subtotal = $2, discount = $3, additional = $4, total = $5, notes = $6
        WHERE id = $1`,
      [billId, totals.subtotal, discount, additional, totals.total, notes]
    );
  });
};

/**
 * Lock a Final bill — irreversible.
 */
const lockFinal = async (billId) => {
  const { rowCount, rows } = await pool.query(
    `UPDATE bills SET status = 'LOCKED'
      WHERE id = $1 AND bill_type = 'FINAL' AND status = 'ACTIVE'
      RETURNING id`,
    [billId]
  );
  if (!rowCount) throw new HttpError(400, 'Bill cannot be locked (not Final or already locked)');
  return rows[0];
};

const markPrinted = async (billId) => {
  await pool.query(
    `UPDATE bills SET printed_at = NOW() WHERE id = $1`, [billId]
  );
};

/* --------------------------- IPD bill flow -------------------------- */

/**
 * Create an EMPTY IPD bill for an admission. Reception fills in services,
 * charges and totals from the bill detail page (same edit UI as Final).
 *
 * If an ACTIVE IPD bill already exists for the admission, return it as-is
 * instead of duplicating — the reception should just re-open the same bill.
 */
const createIpdBillForAdmission = async (admissionId, user) => {
  await ensureIpdBillsMigration();
  return withTx(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT id, patient_id, admitting_doctor_id, status
         FROM admissions WHERE id = $1 FOR UPDATE`, [admissionId]
    );
    const adm = aRows[0];
    if (!adm) throw new HttpError(404, 'Admission not found');

    // Re-use any ACTIVE IPD bill so reception doesn't get duplicates from
    // repeated clicks on "Make a Bill".
    const { rows: exist } = await client.query(
      `SELECT id, bill_number FROM bills
        WHERE admission_id = $1 AND bill_type = 'IPD' AND status = 'ACTIVE'
        ORDER BY id ASC LIMIT 1`,
      [admissionId]
    );
    if (exist[0]) return { id: exist[0].id, billNumber: exist[0].bill_number };

    const billNumber = await nextBillNumber(client, IPD_TYPE);
    const { rows: bRows } = await client.query(
      `INSERT INTO bills (
         bill_number, bill_type, admission_id, patient_id, doctor_id,
         status, subtotal, discount, additional, total, created_by
       ) VALUES ($1, 'IPD', $2, $3, $4, 'ACTIVE', 0, 0, 0, 0, $5)
       RETURNING id`,
      [billNumber, adm.id, adm.patient_id, adm.admitting_doctor_id || null, user.id]
    );
    return { id: bRows[0].id, billNumber };
  });
};

module.exports = {
  AUTO_TYPE, FINAL_TYPE, IPD_TYPE,
  createAutoBillTx,
  listBills, getBill, getByVisitAndType,
  convertToFinal, updateFinal, lockFinal, markPrinted,
  createIpdBillForAdmission,
  ensureIpdBillsMigration,
};
