/**
 * Indoor Patient Department (IPD) — wards, beds, admissions.
 *
 * The admission flow:
 *   1. Doctor clicks "Admit" on the visit page          → status = REQUESTED
 *   2. Reception assigns a FREE bed                     → status = ADMITTED
 *   3. Discharge (from IPD Patients or the visit page)  → status = DISCHARGED
 *   4. Cancel (either side, before admission)           → status = CANCELLED
 *
 * admission_number resets each Financial Year (Apr 1) — same pattern as
 * visit case_number. See utils/financialYear.js.
 */
const { pool, withTx } = require('../config/db');
const HttpError = require('../utils/HttpError');
const { currentFY } = require('../utils/financialYear');
const registerService = require('./registerService');

/* ============================ WARDS ================================ */

const wards = {
  list: async ({ activeOnly = true } = {}) => {
    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.floor,
              w.is_active  AS "isActive",
              w.is_private AS "isPrivate",
              (SELECT COUNT(*)::int FROM beds b
                 WHERE b.ward_id = w.id AND b.is_active = TRUE)               AS "bedCount",
              (SELECT COUNT(*)::int FROM beds b
                 WHERE b.ward_id = w.id AND b.status = 'FREE' AND b.is_active = TRUE) AS "freeCount"
         FROM wards w
        ${activeOnly ? 'WHERE w.is_active = TRUE' : ''}
        ORDER BY w.name ASC`
    );
    return rows;
  },
  create: async ({ name, floor, isPrivate = false }) => {
    if (!name) throw new HttpError(400, 'name is required');
    const { rows } = await pool.query(
      `INSERT INTO wards (name, floor, is_private)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), (floor || '').trim() || null, !!isPrivate]
    );
    return rows[0];
  },
  update: async (id, { name, floor, isActive, isPrivate }) => {
    const set = []; const params = []; let i = 1;
    if (name !== undefined)      { set.push(`name = $${i++}`);       params.push(name.trim()); }
    if (floor !== undefined)     { set.push(`floor = $${i++}`);      params.push((floor || '').trim() || null); }
    if (isActive !== undefined)  { set.push(`is_active = $${i++}`);  params.push(!!isActive); }
    if (isPrivate !== undefined) { set.push(`is_private = $${i++}`); params.push(!!isPrivate); }
    if (!set.length) throw new HttpError(400, 'Nothing to update');
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE wards SET ${set.join(', ')} WHERE id = $${i} RETURNING *`, params
    );
    if (!rows[0]) throw new HttpError(404, 'Ward not found');
    return rows[0];
  },
  remove: async (id) => {
    const { rowCount } = await pool.query(
      `UPDATE wards SET is_active = FALSE WHERE id = $1`, [id]
    );
    if (!rowCount) throw new HttpError(404, 'Ward not found');
  },
};

/* ============================ BEDS ================================= */

// Idempotent one-shot drop of the legacy `daily_rate` column so existing
// installs match the new schema without needing a manual `npm run init`.
let bedsMigrated = false;
const ensureBedsMigration = async () => {
  if (bedsMigrated) return;
  await pool.query(`ALTER TABLE beds DROP COLUMN IF EXISTS daily_rate`);
  bedsMigrated = true;
};

const beds = {
  list: async ({ wardId, freeOnly = false, activeOnly = true } = {}) => {
    await ensureBedsMigration();
    const where = []; const params = [];
    if (activeOnly) where.push(`b.is_active = TRUE`);
    if (wardId)     { params.push(wardId);        where.push(`b.ward_id = $${params.length}`); }
    if (freeOnly)   { where.push(`b.status = 'FREE'`); }
    const { rows } = await pool.query(
      `SELECT b.id, b.ward_id AS "wardId", b.bed_number AS "bedNumber",
              b.bed_type AS "bedType",
              b.status, b.is_active AS "isActive",
              w.name AS "wardName", w.floor
         FROM beds b JOIN wards w ON w.id = b.ward_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY w.name ASC, b.bed_number ASC`,
      params
    );
    return rows;
  },
  create: async ({ wardId, bedNumber, bedType = 'General' }) => {
    await ensureBedsMigration();
    if (!wardId || !bedNumber) throw new HttpError(400, 'wardId and bedNumber are required');
    const { rows } = await pool.query(
      `INSERT INTO beds (ward_id, bed_number, bed_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [wardId, bedNumber.trim(), (bedType || '').trim() || 'General']
    );
    return rows[0];
  },

  /**
   * Bulk-create N rooms in one call:
   *   { wardId, bedType, count, prefix?, startNumber?, padWidth? }
   *
   * Room numbers are generated as `${prefix}${zeroPad(n)}`, e.g.
   *   prefix="GEN-", startNumber=1, padWidth=2 → GEN-01, GEN-02, …
   *
   * Room numbers are FIXED after creation — the edit dialog will hide the
   * bed_number field per the clinic's policy.
   */
  bulkCreate: async ({ wardId, bedType, count, prefix = '', startNumber = 1, padWidth = 2 }) => {
    await ensureBedsMigration();
    if (!wardId) throw new HttpError(400, 'wardId is required');
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0 || n > 500) {
      throw new HttpError(400, 'count must be between 1 and 500');
    }
    const start = Number(startNumber);
    if (!Number.isFinite(start) || start < 1) {
      throw new HttpError(400, 'startNumber must be >= 1');
    }
    const width = Math.max(1, Number(padWidth) || 2);
    const typ = (bedType || '').trim() || 'General';

    return withTx(async (client) => {
      const inserted = [];
      const conflicts = [];
      for (let i = 0; i < n; i++) {
        const num = String(start + i).padStart(width, '0');
        const bedNumber = `${prefix}${num}`;
        try {
          const { rows } = await client.query(
            `INSERT INTO beds (ward_id, bed_number, bed_type)
             VALUES ($1, $2, $3) RETURNING id, bed_number AS "bedNumber"`,
            [wardId, bedNumber, typ]
          );
          inserted.push(rows[0]);
        } catch (e) {
          if (e.code === '23505') conflicts.push(bedNumber); // unique violation — skip
          else throw e;
        }
      }
      return { inserted, conflicts };
    });
  },
  update: async (id, { bedNumber, bedType, isActive }) => {
    await ensureBedsMigration();
    const set = []; const params = []; let i = 1;
    if (bedNumber !== undefined) { set.push(`bed_number = $${i++}`); params.push(bedNumber.trim()); }
    if (bedType !== undefined)   { set.push(`bed_type = $${i++}`);   params.push(bedType); }
    if (isActive !== undefined)  { set.push(`is_active = $${i++}`);  params.push(!!isActive); }
    if (!set.length) throw new HttpError(400, 'Nothing to update');
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE beds SET ${set.join(', ')} WHERE id = $${i} RETURNING *`, params
    );
    if (!rows[0]) throw new HttpError(404, 'Bed not found');
    return rows[0];
  },
  remove: async (id) => {
    // Refuse to soft-delete a currently-occupied bed.
    const { rows } = await pool.query(`SELECT status FROM beds WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Bed not found');
    if (rows[0].status === 'OCCUPIED') {
      throw new HttpError(400, 'Cannot deactivate an occupied bed. Discharge the patient first.');
    }
    await pool.query(`UPDATE beds SET is_active = FALSE WHERE id = $1`, [id]);
  },
};

/* ========================= ADMISSIONS ============================== */

const ADMISSION_SELECT = `
  SELECT a.id,
         a.admission_number AS "admissionNumber",
         a.fy_key           AS "fyKey",
         a.patient_id       AS "patientId",
         a.source_visit_id  AS "sourceVisitId",
         a.bed_id           AS "bedId",
         a.admitting_doctor_id AS "admittingDoctorId",
         a.admission_diagnosis AS "admissionDiagnosis",
         a.status,
         a.admitted_at   AS "admittedAt",
         a.discharged_at AS "dischargedAt",
         a.discharge_notes AS "dischargeNotes",
         a.created_at    AS "createdAt",
         p.patient_code  AS "patientCode",
         (p.first_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.surname) AS "patientName",
         p.gender, p.age, p.mobile, p.village_name AS village,
         b.bed_number    AS "bedNumber",
         w.name          AS "wardName",
         u.full_name     AS "admittingDoctorName",
         v.case_number   AS "sourceCaseNumber"
    FROM admissions a
    JOIN patients p        ON p.id = a.patient_id
    LEFT JOIN beds b       ON b.id = a.bed_id
    LEFT JOIN wards w      ON w.id = b.ward_id
    LEFT JOIN users u      ON u.id = a.admitting_doctor_id
    LEFT JOIN patient_visits v ON v.id = a.source_visit_id
`;

const nextAdmissionNumber = async (client, fyKey) => {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(admission_number), 0) + 1 AS n
       FROM admissions WHERE fy_key = $1`, [fyKey]
  );
  return Number(rows[0].n);
};

const admissions = {
  /** Doctor initiates admission. Status starts at REQUESTED. */
  request: async ({ patientId, sourceVisitId, admissionDiagnosis }, user) => {
    if (!patientId) throw new HttpError(400, 'patientId is required');
    // Do the write inside the transaction, then fetch the joined row on the
    // pool AFTER commit — otherwise getById can't see the new row.
    const id = await withTx(async (client) => {
      const fy = currentFY();
      const n = await nextAdmissionNumber(client, fy.key);
      const { rows } = await client.query(
        `INSERT INTO admissions
           (admission_number, fy_key, patient_id, source_visit_id,
            admitting_doctor_id, admission_diagnosis, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'REQUESTED', $7)
         RETURNING id`,
        [n, fy.key, patientId, sourceVisitId || null, user.id,
         (admissionDiagnosis || '').trim() || null, user.id]
      );
      return rows[0].id;
    });
    return admissions.getById(id);
  },

  /** Reception assigns a free bed and locks the admission in. */
  assignBed: async (admissionId, { bedId }, user) => {
    if (!bedId) throw new HttpError(400, 'bedId is required');
    await withTx(async (client) => {
      const { rows: aRows } = await client.query(
        `SELECT status FROM admissions WHERE id = $1 FOR UPDATE`, [admissionId]
      );
      if (!aRows[0]) throw new HttpError(404, 'Admission not found');
      if (aRows[0].status !== 'REQUESTED') {
        throw new HttpError(400, `Cannot assign bed in status ${aRows[0].status}`);
      }
      const { rows: bRows } = await client.query(
        `SELECT status, is_active FROM beds WHERE id = $1 FOR UPDATE`, [bedId]
      );
      if (!bRows[0]) throw new HttpError(404, 'Bed not found');
      if (!bRows[0].is_active) throw new HttpError(400, 'Bed is deactivated');
      if (bRows[0].status !== 'FREE') throw new HttpError(400, 'Bed is not FREE');

      await client.query(
        `UPDATE admissions
            SET bed_id = $2,
                status = 'ADMITTED',
                admitted_at = COALESCE(admitted_at, NOW()),
                updated_at = NOW()
          WHERE id = $1`,
        [admissionId, bedId]
      );
      await client.query(
        `UPDATE beds SET status = 'OCCUPIED' WHERE id = $1`, [bedId]
      );
    });
    return admissions.getById(admissionId);
  },

  /** Discharge an admitted patient — frees the bed and drops a 3C IPD row. */
  discharge: async (admissionId, { notes } = {}, user) => {
    await withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT status, bed_id FROM admissions WHERE id = $1 FOR UPDATE`,
        [admissionId]
      );
      if (!rows[0]) throw new HttpError(404, 'Admission not found');
      if (rows[0].status !== 'ADMITTED') {
        throw new HttpError(400, `Cannot discharge in status ${rows[0].status}`);
      }
      await client.query(
        `UPDATE admissions
            SET status = 'DISCHARGED',
                discharged_at = NOW(),
                discharge_notes = COALESCE($2, discharge_notes),
                updated_at = NOW()
          WHERE id = $1`,
        [admissionId, (notes || '').trim() || null]
      );
      if (rows[0].bed_id) {
        await client.query(
          `UPDATE beds SET status = 'FREE' WHERE id = $1`, [rows[0].bed_id]
        );
      }
    });

    const full = await admissions.getById(admissionId);

    // Auto-add a 3C Register IPD entry seeded from this admission.
    // Fire-and-forget: the register insert is idempotent (one row per
    // admission_id) so a retry never duplicates, and if it fails the
    // discharge itself still succeeds — admin can add the row manually
    // from the register page.
    try {
      await registerService.createIpdEntryFromAdmission(full, user?.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ipd] failed to auto-create 3C IPD entry:', e.message);
    }

    return full;
  },

  /** Cancel a REQUESTED admission (before reception assigns a bed). */
  cancel: async (admissionId) => {
    const { rowCount } = await pool.query(
      `UPDATE admissions
          SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1 AND status = 'REQUESTED'`,
      [admissionId]
    );
    if (!rowCount) throw new HttpError(400, 'Only REQUESTED admissions can be cancelled');
  },

  getById: async (id) => {
    const { rows } = await pool.query(`${ADMISSION_SELECT} WHERE a.id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Admission not found');
    return rows[0];
  },

  list: async ({ status, patientId } = {}) => {
    const where = []; const params = [];
    if (status)    { params.push(status);    where.push(`a.status = $${params.length}`); }
    if (patientId) { params.push(patientId); where.push(`a.patient_id = $${params.length}`); }
    const { rows } = await pool.query(
      `${ADMISSION_SELECT}
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.created_at DESC`,
      params
    );
    return rows;
  },
};

/* ========================= INDOOR SHEET ============================
 * Daily observation chart for an admitted patient. One DB row per
 * (admission_id, reading_date) covering all four slots + the day's
 * medicine notes + steam/chest_pt counters.
 * =================================================================== */

let indoorTableEnsured = false;
const ensureIndoorTable = async () => {
  if (indoorTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS indoor_sheet_days (
      id            SERIAL PRIMARY KEY,
      admission_id  INTEGER NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
      reading_date  DATE    NOT NULL,
      pulse_10am    VARCHAR(20), bp_10am    VARCHAR(30), spo2_10am    VARCHAR(20),
      pulse_4pm     VARCHAR(20), bp_4pm     VARCHAR(30), spo2_4pm     VARCHAR(20),
      pulse_10pm    VARCHAR(20), bp_10pm    VARCHAR(30), spo2_10pm    VARCHAR(20),
      pulse_6am     VARCHAR(20), bp_6am     VARCHAR(30), spo2_6am     VARCHAR(20),
      medicine      TEXT,
      steam         INTEGER NOT NULL DEFAULT 0,
      chest_pt      INTEGER NOT NULL DEFAULT 0,
      updated_by    INTEGER REFERENCES users(id),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (admission_id, reading_date)
    )
  `);
  // Additive migrations — safe to re-run every boot.
  await pool.query(`ALTER TABLE indoor_sheet_days
    ADD COLUMN IF NOT EXISTS medicine_lines JSONB   NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE indoor_sheet_days
    ADD COLUMN IF NOT EXISTS steam_pm       INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE indoor_sheet_days
    ADD COLUMN IF NOT EXISTS chest_pt_pm    INTEGER NOT NULL DEFAULT 0`);
  indoorTableEnsured = true;
};

const rowToDay = (r) => ({
  id: r.id,
  admissionId: r.admission_id,
  readingDate: r.reading_date,
  pulse10am: r.pulse_10am, bp10am: r.bp_10am, spo210am: r.spo2_10am,
  pulse4pm:  r.pulse_4pm,  bp4pm:  r.bp_4pm,  spo24pm:  r.spo2_4pm,
  pulse10pm: r.pulse_10pm, bp10pm: r.bp_10pm, spo210pm: r.spo2_10pm,
  pulse6am:  r.pulse_6am,  bp6am:  r.bp_6am,  spo26am:  r.spo2_6am,
  // Prefer the new structured list; if empty AND the legacy free-text
  // column has content, surface that as a single line so old data still
  // shows up in the redesigned UI.
  medicineLines: Array.isArray(r.medicine_lines) && r.medicine_lines.length
    ? r.medicine_lines
    : (r.medicine ? [{ med: r.medicine, dose: '', route: '', freq: '' }] : []),
  medicine: r.medicine || '',
  steam:      r.steam       || 0,
  chestPt:    r.chest_pt    || 0,
  steamPm:    r.steam_pm    || 0,
  chestPtPm:  r.chest_pt_pm || 0,
  updatedAt: r.updated_at,
});

const toInt = (v) => (v == null || v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0));

// Only keep lines with at least one non-blank cell — we don't want to
// bloat the JSON with empty rows the user scrolled past.
const cleanMedicineLines = (lines) => {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((l) => ({
      med:   String(l?.med   ?? '').trim(),
      dose:  String(l?.dose  ?? '').trim(),
      route: String(l?.route ?? '').trim(),
      freq:  String(l?.freq  ?? '').trim(),
    }))
    .filter((l) => l.med || l.dose || l.route || l.freq);
};

// Camel → snake on the way in. Any other keys in the payload are ignored.
const dayToRow = (d) => ({
  pulse_10am: d.pulse10am, bp_10am: d.bp10am, spo2_10am: d.spo210am,
  pulse_4pm:  d.pulse4pm,  bp_4pm:  d.bp4pm,  spo2_4pm:  d.spo24pm,
  pulse_10pm: d.pulse10pm, bp_10pm: d.bp10pm, spo2_10pm: d.spo210pm,
  pulse_6am:  d.pulse6am,  bp_6am:  d.bp6am,  spo2_6am:  d.spo26am,
  medicine:       d.medicine || null,           // legacy — write for back-compat readers
  medicine_lines: cleanMedicineLines(d.medicineLines),
  steam:          toInt(d.steam),
  chest_pt:       toInt(d.chestPt),
  steam_pm:       toInt(d.steamPm),
  chest_pt_pm:    toInt(d.chestPtPm),
});

const indoorSheet = {
  get: async (admissionId) => {
    await ensureIndoorTable();
    const admission = await admissions.getById(admissionId);
    const { rows } = await pool.query(
      `SELECT * FROM indoor_sheet_days
        WHERE admission_id = $1
        ORDER BY reading_date ASC`,
      [admissionId]
    );
    return { admission, days: rows.map(rowToDay) };
  },

  /**
   * Batch upsert. `days` is an array of { readingDate, ...fields }. Each row
   * is written with ON CONFLICT (admission_id, reading_date) DO UPDATE.
   * Empty rows (all fields blank + steam/chest_pt = 0) are skipped so the
   * table doesn't fill with junk for un-recorded days.
   */
  save: async (admissionId, days, user) => {
    await ensureIndoorTable();
    if (!Array.isArray(days)) throw new HttpError(400, 'days must be an array');

    // Confirm the admission exists so we don't create orphans on a bad id.
    const { rows: aRows } = await pool.query(
      `SELECT id FROM admissions WHERE id = $1`, [admissionId]
    );
    if (!aRows[0]) throw new HttpError(404, 'Admission not found');

    return withTx(async (client) => {
      let written = 0;
      for (const d of days) {
        if (!d || !d.readingDate) continue;
        const snake = dayToRow(d);
        // Skip empty rows so we don't fill the table with placeholders. A
        // row is "empty" when every vital cell is blank, medicine_lines
        // has 0 entries, medicine text is blank, and every counter is 0.
        const vitalsBlank =
          !snake.pulse_10am && !snake.bp_10am && !snake.spo2_10am &&
          !snake.pulse_4pm  && !snake.bp_4pm  && !snake.spo2_4pm  &&
          !snake.pulse_10pm && !snake.bp_10pm && !snake.spo2_10pm &&
          !snake.pulse_6am  && !snake.bp_6am  && !snake.spo2_6am;
        const allBlank = vitalsBlank
          && !snake.medicine
          && (!snake.medicine_lines || snake.medicine_lines.length === 0)
          && !snake.steam && !snake.chest_pt && !snake.steam_pm && !snake.chest_pt_pm;
        if (allBlank) continue;

        await client.query(
          `INSERT INTO indoor_sheet_days
             (admission_id, reading_date,
              pulse_10am, bp_10am, spo2_10am,
              pulse_4pm,  bp_4pm,  spo2_4pm,
              pulse_10pm, bp_10pm, spo2_10pm,
              pulse_6am,  bp_6am,  spo2_6am,
              medicine, medicine_lines,
              steam, chest_pt, steam_pm, chest_pt_pm,
              updated_by, updated_at)
           VALUES ($1, $2::date,
                   $3,$4,$5, $6,$7,$8, $9,$10,$11, $12,$13,$14,
                   $15, $16::jsonb,
                   $17, $18, $19, $20,
                   $21, NOW())
           ON CONFLICT (admission_id, reading_date) DO UPDATE
             SET pulse_10am     = EXCLUDED.pulse_10am,
                 bp_10am        = EXCLUDED.bp_10am,
                 spo2_10am      = EXCLUDED.spo2_10am,
                 pulse_4pm      = EXCLUDED.pulse_4pm,
                 bp_4pm         = EXCLUDED.bp_4pm,
                 spo2_4pm       = EXCLUDED.spo2_4pm,
                 pulse_10pm     = EXCLUDED.pulse_10pm,
                 bp_10pm        = EXCLUDED.bp_10pm,
                 spo2_10pm      = EXCLUDED.spo2_10pm,
                 pulse_6am      = EXCLUDED.pulse_6am,
                 bp_6am         = EXCLUDED.bp_6am,
                 spo2_6am       = EXCLUDED.spo2_6am,
                 medicine       = EXCLUDED.medicine,
                 medicine_lines = EXCLUDED.medicine_lines,
                 steam          = EXCLUDED.steam,
                 chest_pt       = EXCLUDED.chest_pt,
                 steam_pm       = EXCLUDED.steam_pm,
                 chest_pt_pm    = EXCLUDED.chest_pt_pm,
                 updated_by     = EXCLUDED.updated_by,
                 updated_at     = NOW()`,
          [
            admissionId, d.readingDate,
            snake.pulse_10am, snake.bp_10am, snake.spo2_10am,
            snake.pulse_4pm,  snake.bp_4pm,  snake.spo2_4pm,
            snake.pulse_10pm, snake.bp_10pm, snake.spo2_10pm,
            snake.pulse_6am,  snake.bp_6am,  snake.spo2_6am,
            snake.medicine, JSON.stringify(snake.medicine_lines),
            snake.steam, snake.chest_pt, snake.steam_pm, snake.chest_pt_pm,
            user?.id || null,
          ]
        );
        written++;
      }
      return { written };
    });
  },

  removeDay: async (admissionId, readingDate) => {
    await ensureIndoorTable();
    const { rowCount } = await pool.query(
      `DELETE FROM indoor_sheet_days
        WHERE admission_id = $1 AND reading_date = $2::date`,
      [admissionId, readingDate]
    );
    return { removed: rowCount };
  },

  /**
   * Doctor's dashboard feed — all indoor-sheet edits within the last
   * `hoursWindow` hours (default 6), grouped by admission. The rolling
   * cutoff is the display filter; nothing is deleted here (the per-patient
   * Indoor Sheet still keeps everything).
   *
   * When `since` is supplied it's ANDed with the window — the caller uses
   * this for "any change since I last checked" polling.
   */
  recentActivity: async ({ hoursWindow = 6, since = null } = {}) => {
    await ensureIndoorTable();
    const cutoff = new Date(Date.now() - hoursWindow * 3600 * 1000);
    const cutoffIso = cutoff.toISOString();
    const params = [cutoffIso];
    let sinceClause = '';
    if (since) {
      params.push(since);
      sinceClause = ` AND d.updated_at >= $${params.length}::timestamptz`;
    }
    const { rows } = await pool.query(`
      SELECT d.admission_id AS "admissionId",
             MAX(d.updated_at) AS "lastUpdatedAt",
             COUNT(*)::int AS "daysTouched"
        FROM indoor_sheet_days d
       WHERE d.updated_at >= $1::timestamptz${sinceClause}
       GROUP BY d.admission_id
       ORDER BY MAX(d.updated_at) DESC
    `, params);

    // Hydrate each admission (patient info + all days in the window).
    const out = [];
    for (const r of rows) {
      let admission;
      try {
        admission = await admissions.getById(r.admissionId);
      } catch { continue; /* admission gone — skip */ }
      const { rows: dayRows } = await pool.query(
        `SELECT * FROM indoor_sheet_days
          WHERE admission_id = $1
            AND updated_at >= $2::timestamptz${sinceClause}
          ORDER BY reading_date ASC`,
        params.length > 1 ? [r.admissionId, cutoffIso, since] : [r.admissionId, cutoffIso]
      );
      out.push({
        admission,
        days: dayRows.map(rowToDay),
        lastUpdatedAt: r.lastUpdatedAt,
        daysTouched: r.daysTouched,
      });
    }
    return {
      windowHours: hoursWindow,
      cutoff: cutoffIso,
      since: since || null,
      admissions: out,
    };
  },
};

module.exports = { wards, beds, admissions, indoorSheet };
