/**
 * Doctor service. Saves examination, prescription, advice, and follow-up.
 *
 * The clinic's workflow has two doctor touchpoints:
 *   1. Partial save — after Examination + Investigation are captured, the
 *      patient leaves to get reports/scans. Visit stays in WAITING_FOR_DOCTOR.
 *   2. Final save   — prescription, advice, plan, follow-up. Promotes the
 *      visit to COMPLETED.
 *
 * Toggle with `body.partial === true`.
 */
const { withTx, pool } = require('../config/db');
const HttpError = require('../utils/HttpError');

const saveDoctorRecord = async (visitId, body, user) => {
  const partial = body.partial === true;
  return withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT status FROM patient_visits WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [visitId]
    );
    if (!rows[0]) throw new HttpError(404, 'Visit not found');
    if (!['WAITING_FOR_DOCTOR', 'COMPLETED'].includes(rows[0].status)) {
      throw new HttpError(400, `Cannot edit doctor record in status ${rows[0].status}`);
    }

    const examinationJson   = JSON.stringify(body.examination   || []);
    const investigationJson = JSON.stringify(body.investigation || []);
    // Plan is a multi-select list of master labels (same shape as
    // examination / investigation). Tolerate a legacy free-text string too.
    const planJson = JSON.stringify(
      Array.isArray(body.plan) ? body.plan
        : (body.plan ? [String(body.plan)] : [])
    );

    if (partial) {
      // Partial save: only examination + investigation. Preserve whatever
      // prescription / plan the doctor may have already written earlier.
      await client.query(
        `INSERT INTO doctor_records
           (visit_id, examination, investigation, doctor_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (visit_id) DO UPDATE SET
           examination     = EXCLUDED.examination,
           investigation   = EXCLUDED.investigation,
           doctor_user_id  = EXCLUDED.doctor_user_id,
           updated_at      = NOW()`,
        [visitId, examinationJson, investigationJson, user.id]
      );
      return; // leave meds/advices/followup/status untouched
    }

    await client.query(
      `INSERT INTO doctor_records
         (visit_id, examination, investigation, prescription, plan, doctor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (visit_id) DO UPDATE SET
         examination     = EXCLUDED.examination,
         investigation   = EXCLUDED.investigation,
         prescription    = EXCLUDED.prescription,
         plan            = EXCLUDED.plan,
         doctor_user_id  = EXCLUDED.doctor_user_id,
         updated_at      = NOW()`,
      [visitId, examinationJson, investigationJson,
       body.prescription || null, planJson, user.id]
    );

    // Replace prescription medicine lines. Each item carries a medicine_id
    // (when picked from the master) and a denormalised medicine_name snapshot
    // so historical prescriptions stay readable even if the master changes.
    await client.query(`DELETE FROM prescription_items WHERE visit_id = $1`, [visitId]);
    const meds = Array.isArray(body.medicines) ? body.medicines : [];
    let pos = 0;
    for (const m of meds) {
      const name = (m.medicineName || m.name || '').trim();
      if (!name) continue;             // skip empty rows
      await client.query(
        `INSERT INTO prescription_items
           (visit_id, position, medicine_id, medicine_name, dosage, intake, days, qty, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          visitId,
          pos,
          m.medicineId || null,
          name,
          (m.dosage || '').trim() || null,
          (m.intake || '').trim() || null,
          m.days != null && m.days !== '' ? Number(m.days) : null,
          m.qty  != null && m.qty  !== '' ? Number(m.qty)  : null,
          (m.remarks || '').trim() || null,
        ]
      );
      pos += 1;
    }

    // Replace advices
    await client.query(`DELETE FROM doctor_advices WHERE visit_id = $1`, [visitId]);
    const advices = Array.isArray(body.advices) ? body.advices : [];
    for (const a of advices) {
      if (a.adviceId) {
        await client.query(
          `INSERT INTO doctor_advices (visit_id, advice_id) VALUES ($1, $2)`,
          [visitId, a.adviceId]
        );
      } else if (a.customText) {
        await client.query(
          `INSERT INTO doctor_advices (visit_id, custom_text) VALUES ($1, $2)`,
          [visitId, a.customText.trim()]
        );
      }
    }

    // Upsert follow-up
    await client.query(`DELETE FROM followups WHERE visit_id = $1`, [visitId]);
    if (body.followupDate || body.followupNotes) {
      await client.query(
        `INSERT INTO followups (visit_id, followup_date, notes) VALUES ($1, $2, $3)`,
        [visitId, body.followupDate || null, body.followupNotes || null]
      );
    }

    await client.query(
      `UPDATE patient_visits
          SET status = 'COMPLETED', doctor_id = $2
        WHERE id = $1`,
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
      WHERE v.status = 'WAITING_FOR_DOCTOR'
        AND v.deleted_at IS NULL
      ORDER BY v.visit_date ASC, v.visit_time ASC`
  );
  return rows;
};

module.exports = { saveDoctorRecord, myQueue };
