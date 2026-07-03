/**
 * Disease-medicine templates.
 * For each active disease in known_disease_master, the admin may register
 * the "usual" medicine list. Doctor's Rx form fetches it on demand.
 */
const { pool, withTx } = require('../config/db');
const HttpError = require('../utils/HttpError');

const listDiseasesWithCounts = async () => {
  const { rows } = await pool.query(
    `SELECT d.id, d.code, d.name, d.is_active AS "isActive",
            COUNT(t.id)::int AS "templateCount"
       FROM known_disease_master d
       LEFT JOIN disease_medicine_templates t ON t.disease_id = d.id
      GROUP BY d.id
      ORDER BY d.name`
  );
  return rows;
};

const getTemplatesForDisease = async (diseaseId) => {
  const { rows } = await pool.query(
    `SELECT id, disease_id AS "diseaseId", position,
            medicine_id AS "medicineId", medicine_name AS "medicineName",
            dosage, intake, days, qty, remarks
       FROM disease_medicine_templates
      WHERE disease_id = $1
      ORDER BY position ASC, id ASC`,
    [diseaseId]
  );
  return rows;
};

/**
 * Replace-all: wipe the existing template rows for a disease and insert
 * whatever the admin submitted. Runs in one transaction so the doctor
 * never sees a half-updated template mid-save.
 */
const replaceTemplates = async (diseaseId, items) => {
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
  return withTx(async (client) => {
    // Confirm the disease exists.
    const { rows: dRows } = await client.query(
      `SELECT id FROM known_disease_master WHERE id = $1`, [diseaseId]
    );
    if (!dRows[0]) throw new HttpError(404, 'Disease not found');

    await client.query(
      `DELETE FROM disease_medicine_templates WHERE disease_id = $1`,
      [diseaseId]
    );
    let pos = 0;
    for (const m of items) {
      const name = (m.medicineName || m.name || '').trim();
      if (!name) continue;
      await client.query(
        `INSERT INTO disease_medicine_templates
           (disease_id, position, medicine_id, medicine_name,
            dosage, intake, days, qty, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          diseaseId, pos,
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
    return getTemplatesForDisease(diseaseId);
  });
};

module.exports = { listDiseasesWithCounts, getTemplatesForDisease, replaceTemplates };
