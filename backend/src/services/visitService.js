/**
 * Visit-level queries: queues for each role + visit detail lookup.
 */
const { pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

const baseSelect = `
  SELECT v.id, v.case_number AS "caseNumber",
         v.visit_date AS "visitDate", v.visit_time AS "visitTime",
         v.case_type AS "caseType", v.status,
         p.id AS "patientId", p.patient_code AS "patientCode",
         (p.first_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.surname) AS "patientName",
         p.gender, p.mobile, p.village_name AS "village"
    FROM patient_visits v
    JOIN patients p ON p.id = v.patient_id
   WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
`;

const queueByStatus = async (status, { limit = 100 } = {}) => {
  const { rows } = await pool.query(
    `${baseSelect}
       AND v.status = $1
     ORDER BY v.visit_date ASC, v.visit_time ASC
     LIMIT $2`,
    [status, limit]
  );
  return rows;
};

const getVisitFull = async (visitId) => {
  const { rows } = await pool.query(
    `SELECT v.id, v.case_number AS "caseNumber",
            v.visit_date AS "visitDate", v.visit_time AS "visitTime",
            v.case_type AS "caseType", v.status,
            v.created_by AS "receptionistId",
            p.id AS "patientId", p.patient_code AS "patientCode",
            p.first_name AS "firstName", p.middle_name AS "middleName", p.surname,
            p.gender, p.age, p.mobile, p.address, p.village_name AS "village",
            p.taluka, p.district, p.state,
            p.allergies, p.remarks,
            u.full_name AS "createdByName"
       FROM patient_visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users u ON u.id = v.created_by
      WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [visitId]
  );
  if (!rows[0]) throw new HttpError(404, 'Visit not found');
  const visit = rows[0];

  const { rows: moRows } = await pool.query(
    `SELECT weight_kg AS "weight", pulse, bp_systolic AS "bpSystolic",
            bp_diastolic AS "bpDiastolic", spo2, complaints
       FROM medical_officer_records WHERE visit_id = $1`,
    [visitId]
  );
  visit.medicalOfficer = moRows[0] || null;

  const { rows: dRows } = await pool.query(
    `SELECT examination, investigation, prescription, plan
       FROM doctor_records WHERE visit_id = $1`,
    [visitId]
  );
  visit.doctor = dRows[0] || null;

  const { rows: meds } = await pool.query(
    `SELECT id, position, medicine_id AS "medicineId", medicine_name AS "medicineName",
            dosage, intake, days, qty, remarks
       FROM prescription_items
      WHERE visit_id = $1
      ORDER BY position ASC, id ASC`,
    [visitId]
  );
  visit.medicines = meds;

  const { rows: kd } = await pool.query(
    `SELECT pkd.disease_id AS "diseaseId", m.code, m.name, pkd.custom_name AS "customName"
       FROM patient_known_diseases pkd
       LEFT JOIN known_disease_master m ON m.id = pkd.disease_id
      WHERE pkd.visit_id = $1`,
    [visitId]
  );
  visit.knownDiseases = kd;

  const { rows: vc } = await pool.query(
    `SELECT vc.id, vc.complaint_id AS "complaintId", cm.code, cm.name,
            vc.custom_name AS "customName", vc.duration
       FROM visit_complaints vc
       LEFT JOIN complaint_master cm ON cm.id = vc.complaint_id
      WHERE vc.visit_id = $1
      ORDER BY vc.id ASC`,
    [visitId]
  );
  visit.complaints = vc;

  const { rows: ad } = await pool.query(
    `SELECT da.advice_id AS "adviceId", am.text, da.custom_text AS "customText"
       FROM doctor_advices da
       LEFT JOIN advice_master am ON am.id = da.advice_id
      WHERE da.visit_id = $1`,
    [visitId]
  );
  visit.advices = ad;

  const { rows: fu } = await pool.query(
    `SELECT followup_date AS "followupDate", notes FROM followups WHERE visit_id = $1`,
    [visitId]
  );
  visit.followup = fu[0] || null;

  const { rows: rep } = await pool.query(
    `SELECT id, original_name AS "originalName", stored_name AS "storedName",
            mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"
       FROM reports WHERE visit_id = $1 ORDER BY created_at DESC`,
    [visitId]
  );
  visit.reports = rep;

  return visit;
};

const search = async ({
  patientCode, caseNumber, name, mobile, village,
  fromDate, toDate, doctorId, status, page = 1, pageSize = 25,
}) => {
  const params = [];
  const where = ['v.deleted_at IS NULL', 'p.deleted_at IS NULL'];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };

  if (patientCode) add('p.patient_code = ?', patientCode);
  if (caseNumber)  add('v.case_number = ?', Number(caseNumber));
  if (mobile)      add('p.mobile LIKE ?', `%${mobile}%`);
  if (village)     add('LOWER(p.village_name) LIKE ?', `%${village.toLowerCase()}%`);
  if (status)      add('v.status = ?', status);
  if (doctorId)    add('v.doctor_id = ?', Number(doctorId));
  if (fromDate)    add('v.visit_date >= ?', fromDate);
  if (toDate)      add('v.visit_date <= ?', toDate);
  if (name) {
    params.push(`%${name.toLowerCase()}%`);
    const ph = `$${params.length}`;
    where.push(`(LOWER(p.first_name) LIKE ${ph} OR LOWER(p.surname) LIKE ${ph})`);
  }

  const offset = (Math.max(1, page) - 1) * pageSize;
  params.push(pageSize, offset);

  const sql = `
    SELECT v.id, v.case_number AS "caseNumber",
           v.visit_date AS "visitDate", v.visit_time AS "visitTime",
           v.status, v.case_type AS "caseType",
           p.id AS "patientId", p.patient_code AS "patientCode",
           (p.first_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.surname) AS "patientName",
           p.mobile, p.village_name AS "village",
           EXISTS (
             SELECT 1 FROM admissions a
              WHERE a.patient_id = p.id AND a.status = 'ADMITTED'
           ) AS "isAdmitted"
      FROM patient_visits v
      JOIN patients p ON p.id = v.patient_id
     WHERE ${where.join(' AND ')}
     ORDER BY v.visit_date DESC, v.visit_time DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await pool.query(sql, params);

  const countSql = `
    SELECT COUNT(*)::int AS total
      FROM patient_visits v
      JOIN patients p ON p.id = v.patient_id
     WHERE ${where.join(' AND ')}`;
  const { rows: cRows } = await pool.query(countSql, params.slice(0, -2));

  return { rows, total: cRows[0].total, page, pageSize };
};

const cancel = async (visitId) => {
  const { rowCount } = await pool.query(
    `UPDATE patient_visits SET status = 'CANCELLED'
      WHERE id = $1 AND status <> 'COMPLETED'`,
    [visitId]
  );
  if (!rowCount) throw new HttpError(400, 'Visit cannot be cancelled');
};

module.exports = { queueByStatus, getVisitFull, search, cancel };
