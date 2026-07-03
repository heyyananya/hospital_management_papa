/**
 * Medical Officer service.
 * Saves vitals, complaints, and known diseases, then promotes the visit
 * status from WAITING_FOR_MEDICAL_OFFICER to WAITING_FOR_DOCTOR.
 */
const { withTx, pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

/**
 * Build a human-readable summary string from the structured complaint list.
 * Used to populate the legacy `medical_officer_records.complaints` TEXT
 * column so downstream consumers (prescription PDF, patient history) still
 * read a printable string without needing the join.
 *
 *   [{ name: 'Cough', duration: '3 days' },
 *    { customName: 'Body ache', duration: '2 days' }]
 *   →  "Cough (3 days); Body ache (2 days)"
 */
const summariseComplaints = (rows, masterById) => rows
  .map((r) => {
    const label = r.complaintId
      ? (masterById.get(r.complaintId) || '').trim()
      : (r.customName || '').trim();
    if (!label) return null;
    const dur = (r.duration || '').trim();
    return dur ? `${label} (${dur})` : label;
  })
  .filter(Boolean)
  .join('; ');

const saveMORecord = async (visitId, body, user) => {
  return withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT status FROM patient_visits WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [visitId]
    );
    if (!rows[0]) throw new HttpError(404, 'Visit not found');
    if (rows[0].status !== 'WAITING_FOR_MEDICAL_OFFICER' && rows[0].status !== 'WAITING_FOR_DOCTOR') {
      throw new HttpError(400, `Cannot edit MO record in status ${rows[0].status}`);
    }

    // Replace presenting complaints for this visit. Accept either the new
    // structured array (`complaints`) or a plain string (`complaintsText`)
    // for backwards-compatible callers.
    const complaintList = Array.isArray(body.complaints) ? body.complaints : [];
    const cleanComplaints = complaintList
      .map((c) => ({
        complaintId: c.complaintId || null,
        customName: c.complaintId ? null : (c.customName || c.name || '').trim() || null,
        duration: (c.duration || '').trim() || null,
      }))
      .filter((c) => c.complaintId || c.customName);

    let complaintsSummary = body.complaintsText || null;
    if (cleanComplaints.length) {
      const idList = cleanComplaints.map((c) => c.complaintId).filter(Boolean);
      let masterById = new Map();
      if (idList.length) {
        const { rows: mRows } = await client.query(
          `SELECT id, name FROM complaint_master WHERE id = ANY($1::int[])`,
          [idList]
        );
        masterById = new Map(mRows.map((r) => [r.id, r.name]));
      }
      complaintsSummary = summariseComplaints(cleanComplaints, masterById);
    }

    // Upsert MO record (one row per visit). The legacy `complaints` TEXT
    // column gets the synthesized summary; the structured rows live in
    // visit_complaints.
    await client.query(
      `INSERT INTO medical_officer_records
         (visit_id, weight_kg, pulse, bp_systolic, bp_diastolic, spo2, complaints, mo_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (visit_id) DO UPDATE SET
         weight_kg    = EXCLUDED.weight_kg,
         pulse        = EXCLUDED.pulse,
         bp_systolic  = EXCLUDED.bp_systolic,
         bp_diastolic = EXCLUDED.bp_diastolic,
         spo2         = EXCLUDED.spo2,
         complaints   = EXCLUDED.complaints,
         mo_user_id   = EXCLUDED.mo_user_id,
         updated_at   = NOW()`,
      [
        visitId,
        body.weight ?? null,
        body.pulse ?? null,
        body.bpSystolic ?? null,
        body.bpDiastolic ?? null,
        body.spo2 ?? null,
        complaintsSummary,
        user.id,
      ]
    );

    // Replace structured complaints for this visit.
    await client.query(`DELETE FROM visit_complaints WHERE visit_id = $1`, [visitId]);
    for (const c of cleanComplaints) {
      await client.query(
        `INSERT INTO visit_complaints (visit_id, complaint_id, custom_name, duration)
         VALUES ($1, $2, $3, $4)`,
        [visitId, c.complaintId, c.customName, c.duration]
      );
    }

    // Replace known diseases for this visit.
    await client.query(`DELETE FROM patient_known_diseases WHERE visit_id = $1`, [visitId]);
    const diseaseList = Array.isArray(body.knownDiseases) ? body.knownDiseases : [];
    for (const d of diseaseList) {
      if (d.diseaseId) {
        await client.query(
          `INSERT INTO patient_known_diseases (visit_id, disease_id) VALUES ($1, $2)`,
          [visitId, d.diseaseId]
        );
      } else if (d.customName) {
        await client.query(
          `INSERT INTO patient_known_diseases (visit_id, custom_name) VALUES ($1, $2)`,
          [visitId, d.customName.trim()]
        );
      }
    }

    // Promote status.
    await client.query(
      `UPDATE patient_visits
          SET status = 'WAITING_FOR_DOCTOR', mo_id = $2
        WHERE id = $1 AND status = 'WAITING_FOR_MEDICAL_OFFICER'`,
      [visitId, user.id]
    );
  });
};

const myQueue = async () => {
  const { rows } = await pool.query(
    `SELECT v.id, v.case_number AS "caseNumber",
            v.visit_date AS "visitDate", v.visit_time AS "visitTime",
            p.patient_code AS "patientCode",
            (p.first_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.surname) AS "patientName",
            p.gender, p.mobile, p.village_name AS "village",
            EXISTS (
              SELECT 1 FROM admissions a
               WHERE a.patient_id = p.id AND a.status = 'ADMITTED'
            ) AS "isAdmitted"
       FROM patient_visits v
       JOIN patients p ON p.id = v.patient_id
      WHERE v.status = 'WAITING_FOR_MEDICAL_OFFICER'
        AND v.deleted_at IS NULL
      ORDER BY v.visit_date ASC, v.visit_time ASC`
  );
  return rows;
};

/**
 * "Patients attended by each Medical Officer" report.
 *
 * Counts distinct visits that have an MO record attached (i.e. the MO
 * actually saved vitals/complaints for them). The whole `users` table is
 * left-joined so a MO with zero attended patients in the window still shows
 * up with a count of 0 — useful for confirming "nobody attended on day X".
 *
 * Filters (all optional):
 *   - fromDate / toDate: ISO date strings, inclusive, against visit_date
 *   - moId:              limit to a single MO user id
 */
const attendedStats = async ({ fromDate, toDate, moId } = {}) => {
  const params = [];
  const visitWhere = [`v.deleted_at IS NULL`];

  if (fromDate) {
    params.push(fromDate);
    visitWhere.push(`v.visit_date >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    visitWhere.push(`v.visit_date <= $${params.length}`);
  }

  let moFilter = '';
  if (moId) {
    params.push(Number(moId));
    moFilter = `WHERE u.id = $${params.length}`;
  }

  const sql = `
    SELECT u.id            AS "moId",
           u.full_name     AS "moName",
           u.username,
           u.role,
           COALESCE(stats.attended_count, 0)::int AS "attendedCount",
           stats.last_attended_at AS "lastAttendedAt"
      FROM users u
      LEFT JOIN (
        SELECT mor.mo_user_id,
               COUNT(DISTINCT mor.visit_id) AS attended_count,
               MAX(mor.updated_at)          AS last_attended_at
          FROM medical_officer_records mor
          JOIN patient_visits v ON v.id = mor.visit_id
         WHERE ${visitWhere.join(' AND ')}
         GROUP BY mor.mo_user_id
      ) stats ON stats.mo_user_id = u.id
     ${moFilter}
       ${moFilter ? 'AND' : 'WHERE'} u.role IN ('MEDICAL_OFFICER', 'ADMIN')
     ORDER BY "attendedCount" DESC, u.full_name ASC
  `;

  const { rows } = await pool.query(sql, params);

  // Aggregate total for convenience in the UI header.
  const total = rows.reduce((sum, r) => sum + Number(r.attendedCount || 0), 0);

  return { rows, total };
};

module.exports = { saveMORecord, myQueue, attendedStats };
