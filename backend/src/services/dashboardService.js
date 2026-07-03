/**
 * Dashboard aggregates - kept as separate small queries so a slow one
 * cannot block the others (the controller fires them in parallel).
 */
const { pool } = require('../config/db');

const todayCounts = async () => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE v.visit_date = CURRENT_DATE)                                   AS "todayTotal",
       COUNT(*) FILTER (WHERE v.visit_date = CURRENT_DATE AND v.status = 'COMPLETED')         AS "todayCompleted",
       COUNT(*) FILTER (WHERE v.visit_date = CURRENT_DATE
                              AND v.status IN ('WAITING_FOR_MEDICAL_OFFICER','WAITING_FOR_DOCTOR')) AS "todayPending",
       COUNT(*) FILTER (WHERE v.visit_date = CURRENT_DATE AND v.status = 'WAITING_FOR_DOCTOR') AS "todayWaitingDoctor",
       COUNT(*) FILTER (WHERE v.visit_date = CURRENT_DATE AND v.status = 'WAITING_FOR_MEDICAL_OFFICER') AS "todayWaitingMO"
     FROM patient_visits v
     WHERE v.deleted_at IS NULL`
  );
  return rows[0];
};

const monthlyCount = async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS "monthly"
       FROM patient_visits
      WHERE deleted_at IS NULL
        AND visit_date >= DATE_TRUNC('month', CURRENT_DATE)`
  );
  return rows[0];
};

/**
 * Financial-year headline count. The current FY (Apr 1 - Mar 31 that
 * includes today) drives the range — labelled on the card as e.g. 2026-27.
 */
const { currentFY } = require('../utils/financialYear');

const fyCount = async () => {
  const fy = currentFY();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS "count"
       FROM patient_visits
      WHERE deleted_at IS NULL
        AND visit_date BETWEEN $1::date AND $2::date`,
    [fy.start.toISOString().slice(0, 10), fy.end.toISOString().slice(0, 10)]
  );
  return { count: rows[0].count, fyKey: fy.key, fyLabel: fy.label };
};

const totals = async () => {
  const { rows } = await pool.query(
    `SELECT
        (SELECT COUNT(*)::int FROM patients WHERE deleted_at IS NULL)        AS "totalPatients",
        (SELECT COUNT(*)::int FROM patient_visits WHERE deleted_at IS NULL)  AS "totalVisits"`
  );
  return rows[0];
};

const followupsToday = async () => {
  const { rows } = await pool.query(
    `SELECT f.followup_date AS "date", f.notes,
            p.patient_code AS "patientCode",
            (p.first_name || ' ' || p.surname) AS "patientName",
            p.mobile, v.case_number AS "caseNumber"
       FROM followups f
       JOIN patient_visits v ON v.id = f.visit_id
       JOIN patients p ON p.id = v.patient_id
      WHERE f.followup_date = CURRENT_DATE
      ORDER BY p.first_name ASC`
  );
  return rows;
};

const recentPatients = async () => {
  const { rows } = await pool.query(
    `SELECT p.id, p.patient_code AS "patientCode",
            (p.first_name || ' ' || p.surname) AS "patientName",
            p.village_name AS "village", p.mobile, p.created_at AS "createdAt"
       FROM patients p
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 10`
  );
  return rows;
};

module.exports = { todayCounts, monthlyCount, fyCount, totals, followupsToday, recentPatients };
