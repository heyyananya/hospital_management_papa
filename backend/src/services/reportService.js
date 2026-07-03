/**
 * Patient report uploads (PDF/images).
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');

const create = async ({ patientId, visitId, file, user }) => {
  if (!file) throw new HttpError(400, 'No file uploaded');
  const { rows } = await pool.query(
    `INSERT INTO reports (patient_id, visit_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, original_name AS "originalName", stored_name AS "storedName",
               mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"`,
    [patientId, visitId || null, file.originalname, file.filename, file.mimetype, file.size, user.id]
  );
  return rows[0];
};

const listForPatient = async (patientId) => {
  const { rows } = await pool.query(
    `SELECT id, visit_id AS "visitId", original_name AS "originalName",
            stored_name AS "storedName", mime_type AS "mimeType",
            size_bytes AS "sizeBytes", created_at AS "createdAt"
       FROM reports WHERE patient_id = $1
      ORDER BY created_at DESC`,
    [patientId]
  );
  return rows;
};

const remove = async (id) => {
  const { rows } = await pool.query(
    `DELETE FROM reports WHERE id = $1 RETURNING stored_name AS "storedName"`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Report not found');
  const filepath = path.resolve(env.UPLOAD_DIR, 'reports', rows[0].storedName);
  fs.promises.unlink(filepath).catch(() => null);
};

module.exports = { create, listForPatient, remove };
