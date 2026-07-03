/**
 * Patient + Visit service.
 *
 * Important domain rule:
 *   - A "patient" is a permanent identity (one record, forever).
 *   - A "visit" is one consultation; every visit gets a new global case number.
 *   - Receptionist must search by mobile/name before registering, to prevent dupes.
 */
const { pool, withTx } = require('../config/db');
const HttpError = require('../utils/HttpError');
const { required, ensureMobile, ensureEnum } = require('../utils/validators');
const { nextPatientCode, nextCaseNumber } = require('../utils/idGenerator');
const billingService = require('./billingService');
const billsService = require('./billsService');

const PATIENT_SELECT = `
  p.id, p.patient_code AS "patientCode",
  p.first_name AS "firstName", p.middle_name AS "middleName", p.surname,
  p.gender, p.age, p.language_id AS "languageId",
  p.address, p.village_id AS "villageId", p.village_name AS "village",
  p.taluka, p.district, p.state,
  p.mobile, p.referred_by_id AS "referredById", p.referred_by_text AS "referredBy",
  p.remarks, p.allergies, p.created_at AS "createdAt"
`;

const search = async ({ mobile, name, patientCode, limit = 25 }) => {
  const params = [];
  const where = ['p.deleted_at IS NULL'];

  if (mobile) {
    params.push(`%${mobile}%`);
    where.push(`p.mobile LIKE $${params.length}`);
  }
  if (name) {
    params.push(`%${name.toLowerCase()}%`);
    where.push(
      `(LOWER(p.first_name) LIKE $${params.length}
        OR LOWER(p.surname) LIKE $${params.length}
        OR LOWER(p.middle_name) LIKE $${params.length})`
    );
  }
  if (patientCode) {
    params.push(patientCode);
    where.push(`p.patient_code = $${params.length}`);
  }
  params.push(limit);

  const sql = `
    SELECT ${PATIENT_SELECT},
      (SELECT MAX(visit_date) FROM patient_visits v
         WHERE v.patient_id = p.id AND v.deleted_at IS NULL) AS "lastVisit"
    FROM patients p
    WHERE ${where.join(' AND ')}
    ORDER BY p.created_at DESC
    LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return rows;
};

const getById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${PATIENT_SELECT} FROM patients p
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Patient not found');
  return rows[0];
};

/**
 * Create a brand-new patient and the first visit in a single transaction.
 * Body shape is the union of patient demographics + visit metadata.
 */
const createNewPatientWithVisit = async (body, user) => {
  required(body, [
    'firstName', 'surname', 'gender',
    'village', 'taluka', 'district', 'state', 'mobile',
  ]);
  ensureMobile(body.mobile);

  return withTx(async (client) => {
    const patientCode = await nextPatientCode(client);
    const { caseNumber, fyKey } = await nextCaseNumber(client);

    const { rows: pRows } = await client.query(
      `INSERT INTO patients (
         patient_code, first_name, middle_name, surname, gender, age, language_id,
         address, village_id, village_name, taluka, district, state,
         mobile, referred_by_id, referred_by_text, remarks, allergies
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
       ) RETURNING id`,
      [
        patientCode, body.firstName, body.middleName || null, body.surname,
        body.gender, body.age ? Number(body.age) : null, body.languageId || null,
        body.address || null,
        body.villageId || null, body.village, body.taluka, body.district, body.state,
        body.mobile, body.referredById || null, body.referredBy || null,
        body.remarks || null, body.allergies || null,
      ]
    );
    const patientId = pRows[0].id;

    const { rows: vRows } = await client.query(
      `INSERT INTO patient_visits (
         case_number, fy_key, patient_id, visit_date, visit_time, case_type, created_by
       ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIME, 'NEW', $4)
       RETURNING id, case_number AS "caseNumber", fy_key AS "fyKey",
                 visit_date AS "visitDate", visit_time AS "visitTime", status`,
      [caseNumber, fyKey, patientId, user.id]
    );

    // Auto-charge the New Case fee from the service master (legacy table).
    await billingService.autoAddCaseTypeCharge(client, vRows[0].id, 'NEW', user.id);

    // Generate the official Auto Bill (BILL-YYYY-NNNNNN).
    const autoBill = await billsService.createAutoBillTx(client, {
      visitId: vRows[0].id,
      patientId,
      caseType: 'NEW',
      userId: user.id,
    });

    return {
      patient: { id: patientId, patientCode },
      visit: vRows[0],
      bill: autoBill,
    };
  });
};

/**
 * Create a new visit for an existing patient ("Old Case").
 *
 * Guard: if the patient already has an ACTIVE visit today (still in the MO
 * or Doctor queue), we refuse and surface the existing visit so the caller
 * can either open it or force a second visit. This is the fix for the
 * classic "receptionist clicks twice, patient shows up twice in the queue"
 * problem. Pass `{ force: true }` to override.
 */
const createOldCaseVisit = async (patientId, demographics, user, opts = {}) => {
  const patient = await getById(patientId);
  const force = !!opts.force;

  if (!force) {
    const { rows: existing } = await pool.query(
      `SELECT v.id,
              v.case_number AS "caseNumber",
              v.fy_key      AS "fyKey",
              v.status,
              v.visit_date  AS "visitDate",
              v.visit_time  AS "visitTime"
         FROM patient_visits v
        WHERE v.patient_id = $1
          AND v.visit_date = CURRENT_DATE
          AND v.status IN ('WAITING_FOR_MEDICAL_OFFICER','WAITING_FOR_DOCTOR')
          AND v.deleted_at IS NULL
        ORDER BY v.id DESC
        LIMIT 1`,
      [patientId]
    );
    if (existing[0]) {
      throw new HttpError(
        409,
        `Patient already in the queue today — Case #${existing[0].caseNumber} (${existing[0].status.replace(/_/g, ' ').toLowerCase()}).`,
        { existingVisit: existing[0], patient: { id: patient.id, patientCode: patient.patientCode } }
      );
    }
  }

  return withTx(async (client) => {
    // Receptionist may edit demographics on the existing patient.
    if (demographics && Object.keys(demographics).length) {
      const editable = [
        'firstName', 'middleName', 'surname', 'gender', 'age', 'languageId',
        'address', 'villageId', 'village', 'taluka', 'district', 'state',
        'mobile', 'referredById', 'referredBy', 'remarks', 'allergies',
      ];
      const dbCols = {
        firstName: 'first_name', middleName: 'middle_name', surname: 'surname',
        gender: 'gender', age: 'age', languageId: 'language_id',
        address: 'address', villageId: 'village_id', village: 'village_name',
        taluka: 'taluka', district: 'district', state: 'state',
        mobile: 'mobile', referredById: 'referred_by_id', referredBy: 'referred_by_text',
        remarks: 'remarks', allergies: 'allergies',
      };
      const set = [];
      const values = [];
      let i = 1;
      for (const k of editable) {
        if (demographics[k] !== undefined) {
          set.push(`${dbCols[k]} = $${i++}`);
          values.push(demographics[k]);
        }
      }
      if (set.length) {
        values.push(patient.id);
        await client.query(
          `UPDATE patients SET ${set.join(', ')} WHERE id = $${i}`,
          values
        );
      }
    }

    const { caseNumber, fyKey } = await nextCaseNumber(client);
    const { rows } = await client.query(
      `INSERT INTO patient_visits (
         case_number, fy_key, patient_id, visit_date, visit_time, case_type, created_by
       ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIME, 'OLD', $4)
       RETURNING id, case_number AS "caseNumber", fy_key AS "fyKey",
                 visit_date AS "visitDate", visit_time AS "visitTime", status`,
      [caseNumber, fyKey, patient.id, user.id]
    );

    // Auto-charge the Old Case consultation fee (legacy table).
    await billingService.autoAddCaseTypeCharge(client, rows[0].id, 'OLD', user.id);

    // Generate the official Auto Bill (BILL-YYYY-NNNNNN).
    const autoBill = await billsService.createAutoBillTx(client, {
      visitId: rows[0].id,
      patientId: patient.id,
      caseType: 'OLD',
      userId: user.id,
    });

    return {
      patient: { id: patient.id, patientCode: patient.patientCode },
      visit: rows[0],
      bill: autoBill,
    };
  });
};

const updateDemographics = async (id, body) => {
  if (body.mobile) ensureMobile(body.mobile);
  const map = {
    firstName: 'first_name', middleName: 'middle_name', surname: 'surname',
    gender: 'gender', age: 'age', languageId: 'language_id',
    address: 'address', villageId: 'village_id', village: 'village_name',
    taluka: 'taluka', district: 'district', state: 'state',
    mobile: 'mobile', referredById: 'referred_by_id', referredBy: 'referred_by_text',
    remarks: 'remarks', allergies: 'allergies',
  };
  const set = [];
  const values = [];
  let i = 1;
  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) {
      set.push(`${col} = $${i++}`);
      values.push(body[k]);
    }
  }
  if (!set.length) throw new HttpError(400, 'Nothing to update');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE patients SET ${set.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
     RETURNING ${PATIENT_SELECT}`,
    values
  );
  if (!rows[0]) throw new HttpError(404, 'Patient not found');
  return rows[0];
};

/** Soft-delete patient (admin only). */
const softDelete = async (id) => {
  const { rowCount } = await pool.query(
    `UPDATE patients SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!rowCount) throw new HttpError(404, 'Patient not found');
};

/** Full patient history (every visit). */
const history = async (patientId) => {
  const patient = await getById(patientId);
  const { rows: visits } = await pool.query(
    `SELECT v.id, v.case_number AS "caseNumber", v.visit_date AS "visitDate",
            v.visit_time AS "visitTime", v.case_type AS "caseType", v.status,
            mo.weight_kg AS "weight", mo.pulse, mo.bp_systolic AS "bpSystolic",
            mo.bp_diastolic AS "bpDiastolic", mo.spo2, mo.complaints,
            d.examination, d.investigation, d.prescription, d.plan,
            f.followup_date AS "followupDate", f.notes AS "followupNotes"
       FROM patient_visits v
       LEFT JOIN medical_officer_records mo ON mo.visit_id = v.id
       LEFT JOIN doctor_records d           ON d.visit_id  = v.id
       LEFT JOIN followups f                ON f.visit_id  = v.id
      WHERE v.patient_id = $1 AND v.deleted_at IS NULL
      ORDER BY v.visit_date DESC, v.visit_time DESC`,
    [patientId]
  );

  // Hydrate known diseases + advices + medicines + reports per visit, but in
  // batched queries so we don't hit N+1.
  const visitIds = visits.map((v) => v.id);
  let diseases = [];
  let advices = [];
  let medicines = [];
  let reports = [];
  if (visitIds.length) {
    const { rows: dRows } = await pool.query(
      `SELECT pkd.visit_id,
              COALESCE(m.code, m.name, pkd.custom_name) AS name
         FROM patient_known_diseases pkd
         LEFT JOIN known_disease_master m ON m.id = pkd.disease_id
        WHERE pkd.visit_id = ANY($1::int[])`,
      [visitIds]
    );
    diseases = dRows;

    const { rows: aRows } = await pool.query(
      `SELECT da.visit_id, COALESCE(am.text, da.custom_text) AS text
         FROM doctor_advices da
         LEFT JOIN advice_master am ON am.id = da.advice_id
        WHERE da.visit_id = ANY($1::int[])`,
      [visitIds]
    );
    advices = aRows;

    const { rows: rRows } = await pool.query(
      `SELECT id, visit_id AS "visitId", original_name AS "originalName",
              stored_name AS "storedName", mime_type AS "mimeType",
              size_bytes AS "sizeBytes", created_at AS "createdAt"
         FROM reports
        WHERE visit_id = ANY($1::int[])`,
      [visitIds]
    );
    reports = rRows;

    const { rows: mRows } = await pool.query(
      `SELECT visit_id AS "visitId", position,
              medicine_name AS "medicineName",
              dosage, intake, days, qty, remarks
         FROM prescription_items
        WHERE visit_id = ANY($1::int[])
        ORDER BY visit_id, position ASC, id ASC`,
      [visitIds]
    );
    medicines = mRows;
  }

  const groupBy = (arr, key) =>
    arr.reduce((acc, r) => {
      (acc[r[key]] = acc[r[key]] || []).push(r);
      return acc;
    }, {});

  const dByV = groupBy(diseases, 'visit_id');
  const aByV = groupBy(advices, 'visit_id');
  const rByV = groupBy(reports, 'visitId');
  const mByV = groupBy(medicines, 'visitId');

  visits.forEach((v) => {
    v.knownDiseases = (dByV[v.id] || []).map((x) => x.name);
    v.advices = (aByV[v.id] || []).map((x) => x.text);
    v.reports = rByV[v.id] || [];
    v.medicines = mByV[v.id] || [];
  });

  return { patient, visits };
};

module.exports = {
  search,
  getById,
  createNewPatientWithVisit,
  createOldCaseVisit,
  updateDemographics,
  softDelete,
  history,
};
