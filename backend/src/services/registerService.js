/**
 * 3C Register — day-wise OPD bill totals.
 *
 * Aggregates all AUTO bills inside [fromDate, toDate] grouped by visit date
 * and returns one row per day with the day's total. The PDF renders the
 * clinic letterhead (logo + clinic name + doctor name) on top and the
 * doctor's signature at the bottom.
 */
const fs = require('fs');
const path = require('path');
const { pool, withTx } = require('../config/db');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const env = require('../config/env');
const settingsService = require('./settingsService');
const HttpError = require('../utils/HttpError');
const { currentFY, fyForDate } = require('../utils/financialYear');

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const fmtMoney = (n) => Number(n || 0).toFixed(2);

// Idempotent bootstrap so existing DBs pick up the overrides table on first use
// without needing a manual `npm run init`.
let overridesEnsured = false;
const ensureOverridesTable = async () => {
  if (overridesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS three_c_amount_overrides (
      register_date DATE          PRIMARY KEY,
      amount        NUMERIC(12,2) NOT NULL,
      updated_by    INTEGER REFERENCES users(id),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  overridesEnsured = true;
};

/** Day-wise totals between two dates. */
const threeCRegister = async ({ fromDate, toDate }) => {
  if (!fromDate || !toDate) {
    throw new Error('fromDate and toDate are required (YYYY-MM-DD)');
  }
  await ensureOverridesTable();

  const { rows } = await pool.query(
    `SELECT v.visit_date                       AS "date",
            COUNT(*)                           AS "billCount",
            SUM(b.total)                       AS "computedAmount",
            SUM(b.discount)                    AS "discount",
            o.amount                           AS "overrideAmount"
       FROM bills b
       JOIN patient_visits v ON v.id = b.visit_id
       LEFT JOIN three_c_amount_overrides o
              ON o.register_date = v.visit_date
      WHERE b.bill_type = 'AUTO'
        AND b.status <> 'CANCELLED'
        AND v.visit_date BETWEEN $1::date AND $2::date
      GROUP BY v.visit_date, o.amount
      ORDER BY v.visit_date ASC`,
    [fromDate, toDate]
  );

  rows.forEach((r, i) => {
    r.srNo = i + 1;
    r.computedAmount = Number(r.computedAmount || 0);
    r.overrideAmount = r.overrideAmount == null ? null : Number(r.overrideAmount);
    r.amount = r.overrideAmount != null ? r.overrideAmount : r.computedAmount;
    r.edited = r.overrideAmount != null;
    r.discount = Number(r.discount || 0);
    r.billCount = Number(r.billCount || 0);
  });

  const summary = rows.reduce(
    (acc, r) => ({
      days: acc.days + 1,
      billCount: acc.billCount + r.billCount,
      amount: acc.amount + r.amount,
      discount: acc.discount + r.discount,
    }),
    { days: 0, billCount: 0, amount: 0, discount: 0 }
  );

  return { rows, summary, fromDate, toDate };
};

/**
 * Detailed 3C register — one row per bill.
 * Columns: Sr | Date | Case# (patient_code) | Name | Ref.No (bill_number) |
 *          Service | Total | Discount | Net
 */
const threeCRegisterDetail = async ({ fromDate, toDate }) => {
  if (!fromDate || !toDate) {
    throw new Error('fromDate and toDate are required (YYYY-MM-DD)');
  }
  const { rows } = await pool.query(
    `
    WITH services AS (
      SELECT vc.visit_id,
             string_agg(DISTINCT vc.service_name, ', '
                        ORDER BY vc.service_name) AS svc
        FROM visit_charges vc
       GROUP BY vc.visit_id
    )
    SELECT b.id,
           b.bill_number   AS "billNumber",
           b.subtotal,
           b.discount,
           b.additional,
           b.total,
           v.visit_date    AS "visitDate",
           v.case_number   AS "caseNumber",
           p.patient_code  AS "patientCode",
           (p.first_name || ' ' ||
              COALESCE(p.middle_name || ' ', '') || p.surname) AS name,
           COALESCE(s.svc, 'O.P.D.') AS service
      FROM bills b
      JOIN patient_visits v ON v.id = b.visit_id
      JOIN patients p       ON p.id = b.patient_id
      LEFT JOIN services s  ON s.visit_id = b.visit_id
     WHERE b.bill_type = 'AUTO'
       AND b.status <> 'CANCELLED'
       AND v.visit_date BETWEEN $1::date AND $2::date
     ORDER BY v.visit_date ASC, b.id ASC
    `,
    [fromDate, toDate]
  );

  rows.forEach((r, i) => {
    r.srNo = i + 1;
    r.total    = Number(r.total    || 0);
    r.discount = Number(r.discount || 0);
    r.net      = Number(r.total || 0); // total already nets discount + additional
  });

  const summary = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      total: acc.total + r.total,
      discount: acc.discount + r.discount,
      net: acc.net + r.net,
    }),
    { count: 0, total: 0, discount: 0, net: 0 }
  );

  return { rows, summary, fromDate, toDate };
};

/** PDF version — letterhead on top, simple 3-column table, signature at bottom. */
const threeCRegisterPdf = async ({ fromDate, toDate }) => {
  const { rows, summary } = await threeCRegister({ fromDate, toDate });
  const settings = await settingsService.getAll();
  const clinicName = (settings.clinic_name || 'FEFSA HOSPITAL').toUpperCase();
  const doctorName = settings.doctor_name || 'Dr. Ajit B. Patel';

  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Portrait A4
  const PAGE = { w: 595.28, h: 841.89 };
  const M = { left: 50, right: 50, top: 40, bottom: 60 };
  const contentW = PAGE.w - M.left - M.right;
  const tableRight = M.left + contentW;

  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.4, 0.4, 0.4);
  const rule = rgb(0.35, 0.35, 0.35);
  const accent = rgb(0.05, 0.32, 0.46);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M.top;

  // ── Letterhead ──────────────────────────────────────────────
  // logo (left)  clinic name (center)  doctor name (right)
  const logoPath = path.resolve(env.UPLOAD_DIR, 'branding', 'logo.png');
  let logoImg = null;
  if (fs.existsSync(logoPath)) {
    try {
      const bytes = await fs.promises.readFile(logoPath);
      try { logoImg = await pdf.embedPng(bytes); }
      catch { logoImg = await pdf.embedJpg(bytes); }
    } catch { /* no logo */ }
  }
  const HEAD_H = 70;
  if (logoImg) {
    const target = 56;
    const scale = Math.min(target / logoImg.width, target / logoImg.height);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: M.left,
      y: y - HEAD_H + (HEAD_H - lh) / 2,
      width: lw, height: lh,
    });
  }
  // Clinic name (large, centered)
  const nameSize = 20;
  const nameW = fontBold.widthOfTextAtSize(clinicName, nameSize);
  page.drawText(clinicName, {
    x: M.left + (contentW - nameW) / 2,
    y: y - 30,
    size: nameSize, font: fontBold, color: accent,
  });
  // Doctor name (right)
  const drSize = 11;
  const drW = fontBold.widthOfTextAtSize(doctorName, drSize);
  page.drawText(doctorName, {
    x: tableRight - drW,
    y: y - 28,
    size: drSize, font: fontBold, color: ink,
  });
  // Tagline (centered)
  const tagline = 'Chest Physician';
  const tagW = font.widthOfTextAtSize(tagline, 10);
  page.drawText(tagline, {
    x: M.left + (contentW - tagW) / 2,
    y: y - 48,
    size: 10, font, color: muted,
  });
  // Divider under header
  y -= HEAD_H + 4;
  page.drawLine({
    start: { x: M.left, y }, end: { x: tableRight, y },
    thickness: 0.8, color: accent,
  });
  y -= 18;

  // ── Title strip ─────────────────────────────────────────────
  page.drawText('3C Register OPD', {
    x: M.left, y, size: 14, font: fontBold, color: ink,
  });
  const range = `${fmtDate(fromDate)}  to  ${fmtDate(toDate)}`;
  page.drawText(range, {
    x: tableRight - font.widthOfTextAtSize(range, 10),
    y, size: 10, font, color: muted,
  });
  y -= 22;

  // ── 3-column table ──────────────────────────────────────────
  const cols = [
    { key: 'srNo',   label: 'Sr. No.', w: 80,  align: 'center' },
    { key: 'date',   label: 'Date',    w: 0,   align: 'center' }, // fills
    { key: 'amount', label: 'Amount',  w: 130, align: 'right'  },
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[1].w = contentW - fixedW;
  const colX = [];
  { let x = M.left; for (const c of cols) { colX.push(x); x += c.w; } }

  const ROW_H = 22;

  const drawHRule = (yLine) =>
    page.drawLine({
      start: { x: M.left, y: yLine },
      end:   { x: tableRight, y: yLine },
      thickness: 0.6, color: rule,
    });
  const drawVRules = (yTop, yBottom) => {
    let x = M.left;
    for (const c of cols) {
      page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.6, color: rule });
      x += c.w;
    }
    page.drawLine({ start: { x: tableRight, y: yTop }, end: { x: tableRight, y: yBottom }, thickness: 0.6, color: rule });
  };

  const drawCell = (txt, i, opts = {}) => {
    const { size = 11, bold = false, color = ink, padX = 8 } = opts;
    const f = bold ? fontBold : font;
    const c = cols[i];
    const x0 = colX[i];
    const s = String(txt ?? '');
    const tw = f.widthOfTextAtSize(s, size);
    let x = x0 + padX;
    if (c.align === 'center') x = x0 + (c.w - tw) / 2;
    if (c.align === 'right')  x = x0 + c.w - tw - padX;
    page.drawText(s, { x, y, size, font: f, color });
  };

  const ensureRow = () => {
    if (y - ROW_H < M.bottom + 80) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M.top;
      drawHeader();
    }
  };

  const drawHeader = () => {
    const yTop = y;
    const yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.93, 0.95, 0.98),
    });
    drawHRule(yTop);
    drawHRule(yBottom);
    drawVRules(yTop, yBottom);
    y -= 15;
    cols.forEach((c, i) => drawCell(c.label, i, { size: 10, bold: true, color: muted }));
    y = yBottom;
  };

  drawHeader();

  if (!rows.length) {
    y -= 30;
    page.drawText('No bills in this date range.', {
      x: M.left, y, size: 11, font, color: muted,
    });
  } else {
    for (const r of rows) {
      ensureRow();
      const yTop = y;
      const yBottom = y - ROW_H;
      drawHRule(yBottom);
      drawVRules(yTop, yBottom);
      y -= 15;
      drawCell(r.srNo,           0);
      drawCell(fmtDate(r.date),  1);
      drawCell(fmtMoney(r.amount), 2);
      y = yBottom;
    }

    // Totals row
    ensureRow();
    const yTop = y;
    const yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.97, 0.98, 1),
    });
    drawHRule(yTop);
    drawHRule(yBottom);
    drawVRules(yTop, yBottom);
    y -= 15;
    drawCell('Total', 1, { bold: true });
    drawCell(fmtMoney(summary.amount), 2, { bold: true });
    y = yBottom;
  }

  // ── Signature (bottom-right) ────────────────────────────────
  const sigY = M.bottom + 50;
  const drNameW = fontBold.widthOfTextAtSize(doctorName, 12);
  page.drawText(doctorName, {
    x: tableRight - drNameW, y: sigY,
    size: 12, font: fontBold, color: ink,
  });
  const sigSub = 'Chest Physician';
  const subW = font.widthOfTextAtSize(sigSub, 10);
  page.drawText(sigSub, {
    x: tableRight - subW, y: sigY - 14,
    size: 10, font, color: muted,
  });

  // Footer timestamp
  page.drawText(
    `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    { x: M.left, y: M.bottom - 8, size: 8, font, color: muted }
  );

  return pdf.save();
};

/** Detailed PDF — landscape A4 with per-bill rows. */
const threeCRegisterDetailPdf = async ({ fromDate, toDate }) => {
  const { rows, summary } = await threeCRegisterDetail({ fromDate, toDate });
  const settings = await settingsService.getAll();
  const clinicName = (settings.clinic_name || 'FEFSA HOSPITAL').toUpperCase();
  const doctorName = settings.doctor_name || 'Dr. Ajit B. Patel';

  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Landscape A4
  const PAGE = { w: 841.89, h: 595.28 };
  const M = { left: 32, right: 32, top: 34, bottom: 30 };
  const contentW = PAGE.w - M.left - M.right;
  const tableRight = M.left + contentW;

  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.4, 0.4, 0.4);
  const rule = rgb(0.35, 0.35, 0.35);
  const accent = rgb(0.05, 0.32, 0.46);

  const cols = [
    { key: 'srNo',        label: 'Sr.',        w: 36,  align: 'center' },
    { key: 'visitDate',   label: 'Date',       w: 72,  align: 'center' },
    { key: 'patientCode', label: 'Case #',     w: 78,  align: 'center' },
    { key: 'name',        label: 'Name',       w: 0,   align: 'left'   }, // fills
    { key: 'billNumber',  label: 'Ref. No.',   w: 110, align: 'center' },
    { key: 'service',     label: 'Service',    w: 120, align: 'left'   },
    { key: 'total',       label: 'Total',      w: 68,  align: 'right'  },
    { key: 'discount',    label: 'Disc.',      w: 58,  align: 'right'  },
    { key: 'net',         label: 'Net',        w: 68,  align: 'right'  },
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[3].w = contentW - fixedW;
  const colX = [];
  { let x = M.left; for (const c of cols) { colX.push(x); x += c.w; } }

  const ROW_H = 18;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M.top;

  // ── Letterhead ──────────────────────────────────────────────
  const logoPath = path.resolve(env.UPLOAD_DIR, 'branding', 'logo.png');
  let logoImg = null;
  if (fs.existsSync(logoPath)) {
    try {
      const bytes = await fs.promises.readFile(logoPath);
      try { logoImg = await pdf.embedPng(bytes); }
      catch { logoImg = await pdf.embedJpg(bytes); }
    } catch { /* skip */ }
  }
  const HEAD_H = 54;
  if (logoImg) {
    const target = 44;
    const scale = Math.min(target / logoImg.width, target / logoImg.height);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: M.left, y: y - HEAD_H + (HEAD_H - lh) / 2,
      width: lw, height: lh,
    });
  }
  const nameSize = 18;
  const nameW = fontBold.widthOfTextAtSize(clinicName, nameSize);
  page.drawText(clinicName, {
    x: M.left + (contentW - nameW) / 2, y: y - 22,
    size: nameSize, font: fontBold, color: accent,
  });
  const drSize = 11;
  const drW = fontBold.widthOfTextAtSize(doctorName, drSize);
  page.drawText(doctorName, {
    x: tableRight - drW, y: y - 22,
    size: drSize, font: fontBold, color: ink,
  });
  y -= HEAD_H;
  page.drawLine({
    start: { x: M.left, y }, end: { x: tableRight, y },
    thickness: 0.8, color: accent,
  });
  y -= 16;

  // Title strip
  page.drawText('3C Register OPD — Detailed', {
    x: M.left, y, size: 13, font: fontBold, color: ink,
  });
  const range = `${fmtDate(fromDate)}  to  ${fmtDate(toDate)}`;
  page.drawText(range, {
    x: tableRight - font.widthOfTextAtSize(range, 10),
    y, size: 10, font, color: muted,
  });
  y -= 18;

  const drawHRule = (yLine) =>
    page.drawLine({
      start: { x: M.left, y: yLine },
      end:   { x: tableRight, y: yLine },
      thickness: 0.6, color: rule,
    });
  const drawVRules = (yTop, yBottom) => {
    let x = M.left;
    for (const c of cols) {
      page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.6, color: rule });
      x += c.w;
    }
    page.drawLine({ start: { x: tableRight, y: yTop }, end: { x: tableRight, y: yBottom }, thickness: 0.6, color: rule });
  };
  const drawCell = (txt, i, opts = {}) => {
    const { size = 9, bold = false, color = ink, padX = 4 } = opts;
    const f = bold ? fontBold : font;
    const c = cols[i];
    const x0 = colX[i];
    const s = String(txt ?? '');
    const tw = f.widthOfTextAtSize(s, size);
    let x = x0 + padX;
    if (c.align === 'center') x = x0 + (c.w - tw) / 2;
    if (c.align === 'right')  x = x0 + c.w - tw - padX;
    page.drawText(s, { x, y, size, font: f, color });
  };
  const drawHeader = () => {
    const yTop = y, yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.93, 0.95, 0.98),
    });
    drawHRule(yTop); drawHRule(yBottom); drawVRules(yTop, yBottom);
    y -= 13;
    cols.forEach((c, i) => drawCell(c.label, i, { size: 9, bold: true, color: muted }));
    y = yBottom;
  };
  const ensureRow = () => {
    if (y - ROW_H < M.bottom + 40) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M.top;
      drawHeader();
    }
  };

  drawHeader();

  if (!rows.length) {
    y -= 30;
    page.drawText('No bills in this date range.', {
      x: M.left, y, size: 11, font, color: muted,
    });
  } else {
    for (const r of rows) {
      ensureRow();
      const yTop = y, yBottom = y - ROW_H;
      drawHRule(yBottom); drawVRules(yTop, yBottom);
      y -= 13;
      drawCell(r.srNo,                  0);
      drawCell(fmtDate(r.visitDate),    1);
      drawCell(r.patientCode,           2);
      drawCell(r.name,                  3);
      drawCell(r.billNumber,            4);
      drawCell(r.service,               5);
      drawCell(fmtMoney(r.total),       6);
      drawCell(fmtMoney(r.discount),    7);
      drawCell(fmtMoney(r.net),         8);
      y = yBottom;
    }

    // Totals row
    ensureRow();
    const yTop = y, yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.97, 0.98, 1),
    });
    drawHRule(yTop); drawHRule(yBottom); drawVRules(yTop, yBottom);
    y -= 13;
    drawCell('Totals',                    3, { bold: true });
    drawCell(`${summary.count} bills`,    5, { bold: true });
    drawCell(fmtMoney(summary.total),     6, { bold: true });
    drawCell(fmtMoney(summary.discount),  7, { bold: true });
    drawCell(fmtMoney(summary.net),       8, { bold: true });
    y = yBottom;
  }

  // Footer timestamp
  page.drawText(
    `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    { x: M.left, y: M.bottom - 8, size: 8, font, color: muted }
  );

  return pdf.save();
};

/**
 * Set (or clear) the manual amount override for a given date.
 * Passing amount === null removes the override so the register reverts to the
 * auto-computed sum of bills for that day.
 */
const setThreeCAmount = async ({ date, amount, userId }) => {
  if (!date) throw new Error('date is required (YYYY-MM-DD)');
  await ensureOverridesTable();

  if (amount === null || amount === undefined || amount === '') {
    await pool.query(
      `DELETE FROM three_c_amount_overrides WHERE register_date = $1::date`,
      [date]
    );
    return { date, amount: null, cleared: true };
  }

  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('amount must be a non-negative number');
  }

  const { rows } = await pool.query(
    `INSERT INTO three_c_amount_overrides (register_date, amount, updated_by, updated_at)
     VALUES ($1::date, $2, $3, NOW())
     ON CONFLICT (register_date) DO UPDATE
       SET amount = EXCLUDED.amount,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING register_date AS "date", amount, updated_at AS "updatedAt"`,
    [date, n.toFixed(2), userId || null]
  );
  const row = rows[0];
  return { date: row.date, amount: Number(row.amount), updatedAt: row.updatedAt };
};

/* =====================================================================
 * 3C Register IPD — manual ledger of admitted-and-discharged patients.
 * ===================================================================== */

let ipdTableEnsured = false;
const ensureIpdTable = async () => {
  if (ipdTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS three_c_ipd_entries (
      id             SERIAL       PRIMARY KEY,
      admission_id   INTEGER      REFERENCES admissions(id) ON DELETE SET NULL,
      entry_month    DATE         NOT NULL,
      reg_seq        INTEGER      NOT NULL,
      fy_key         VARCHAR(7)   NOT NULL,
      receipt_number INTEGER      NOT NULL,
      patient_name   VARCHAR(200) NOT NULL,
      age            VARCHAR(20),
      village        VARCHAR(200),
      diagnosis      TEXT,
      doa            DATE,
      dod            DATE,
      amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by     INTEGER REFERENCES users(id),
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (entry_month, reg_seq),
      UNIQUE (fy_key,      receipt_number)
    )
  `);
  ipdTableEnsured = true;
};

// "01/05-26" — 2-digit month, 2-digit year, seq left-padded to 2.
const formatRegNumber = (regSeq, entryMonth) => {
  const dt = new Date(entryMonth);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${String(regSeq).padStart(2, '0')}/${mm}-${yy}`;
};

const firstOfMonth = (d) => {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
};

const IPD_SELECT = `
  SELECT id,
         admission_id   AS "admissionId",
         entry_month    AS "entryMonth",
         reg_seq        AS "regSeq",
         fy_key         AS "fyKey",
         receipt_number AS "receiptNumber",
         patient_name   AS "patientName",
         age, village, diagnosis,
         doa, dod, amount,
         created_at     AS "createdAt",
         updated_at     AS "updatedAt"
    FROM three_c_ipd_entries
`;

const hydrateIpd = (r) => ({
  ...r,
  amount: Number(r.amount || 0),
  registrationNumber: formatRegNumber(r.regSeq, r.entryMonth),
});

/**
 * One-shot backfill for admissions that were already DISCHARGED before the
 * auto-hook existed (or if the hook failed for any reason). Idempotent —
 * only creates rows for admissions that don't already have one, and orders
 * by discharge date so older discharges get smaller register numbers.
 */
const backfillMissingIpdEntries = async () => {
  await ensureIpdTable();
  const { rows: missing } = await pool.query(`
    SELECT a.id,
           a.admission_diagnosis AS "admissionDiagnosis",
           a.admitted_at         AS "admittedAt",
           a.discharged_at       AS "dischargedAt",
           p.first_name, p.middle_name, p.surname, p.age,
           p.village_name        AS village
      FROM admissions a
      JOIN patients p ON p.id = a.patient_id
     WHERE a.status = 'DISCHARGED'
       AND NOT EXISTS (
         SELECT 1 FROM three_c_ipd_entries e WHERE e.admission_id = a.id
       )
     ORDER BY a.discharged_at ASC NULLS LAST, a.id ASC
  `);
  for (const a of missing) {
    const patientName = `${a.first_name || ''} ${a.middle_name ? a.middle_name + ' ' : ''}${a.surname || ''}`.trim();
    try {
      await createIpdEntryFromAdmission(
        {
          id: a.id,
          patientName,
          age: a.age,
          village: a.village,
          admissionDiagnosis: a.admissionDiagnosis,
          admittedAt: a.admittedAt,
          dischargedAt: a.dischargedAt,
        },
        null
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[3c-ipd] backfill failed for admission', a.id, e.message);
    }
  }
};

/** List entries; optional date-range filter is applied against DOD (fallback DOA, else entry_month). */
const listThreeCIpd = async ({ fromDate, toDate } = {}) => {
  await ensureIpdTable();
  // Sweep in anything discharged but not yet in the register (past discharges
  // from before the auto-hook existed, or hook-failed rows).
  await backfillMissingIpdEntries();
  const params = [];
  const where = [];
  if (fromDate) {
    params.push(fromDate);
    where.push(`COALESCE(dod, doa, entry_month) >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`COALESCE(dod, doa, entry_month) <= $${params.length}::date`);
  }
  const { rows } = await pool.query(
    `${IPD_SELECT}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY entry_month ASC, reg_seq ASC`,
    params
  );
  const hydrated = rows.map(hydrateIpd);
  const summary = hydrated.reduce(
    (acc, r) => ({ count: acc.count + 1, amount: acc.amount + Number(r.amount || 0) }),
    { count: 0, amount: 0 }
  );
  return { rows: hydrated, summary, fromDate: fromDate || null, toDate: toDate || null };
};

/**
 * Allocate the next monthly reg_seq + FY-scoped receipt_number and INSERT.
 * The month anchor comes from DOD → DOA → today (in that order) so
 * back-dated discharges still land in the correct month bucket.
 */
const createThreeCIpd = async ({
  admissionId, patientName, age, village, diagnosis,
  doa, dod, amount, userId,
}) => {
  if (!patientName || !patientName.trim()) {
    throw new HttpError(400, 'patientName is required');
  }
  await ensureIpdTable();

  const anchor = dod ? new Date(dod) : (doa ? new Date(doa) : new Date());
  const entryMonth = firstOfMonth(anchor);
  const fy = fyForDate(anchor);

  return withTx(async (client) => {
    const { rows: rs } = await client.query(
      `SELECT COALESCE(MAX(reg_seq), 0) + 1 AS n
         FROM three_c_ipd_entries WHERE entry_month = $1::date`,
      [entryMonth]
    );
    const regSeq = Number(rs[0].n);

    const { rows: rr } = await client.query(
      `SELECT COALESCE(MAX(receipt_number), 0) + 1 AS n
         FROM three_c_ipd_entries WHERE fy_key = $1`,
      [fy.key]
    );
    const receiptNumber = Number(rr[0].n);

    const { rows } = await client.query(
      `INSERT INTO three_c_ipd_entries
         (admission_id, entry_month, reg_seq, fy_key, receipt_number,
          patient_name, age, village, diagnosis, doa, dod, amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        admissionId || null, entryMonth, regSeq, fy.key, receiptNumber,
        patientName.trim(), (age || '').toString().trim() || null,
        (village || '').trim() || null, (diagnosis || '').trim() || null,
        doa || null, dod || null, Number(amount) || 0, userId || null,
      ]
    );
    const { rows: full } = await client.query(`${IPD_SELECT} WHERE id = $1`, [rows[0].id]);
    return hydrateIpd(full[0]);
  });
};

/**
 * Update only the editable fields. reg_seq, entry_month, fy_key and
 * receipt_number are FROZEN once assigned — they are the register's serial
 * numbers and rewriting them would corrupt the audit trail.
 */
const updateThreeCIpd = async (id, patch) => {
  await ensureIpdTable();
  const set = []; const params = []; let i = 1;
  const push = (col, val) => { set.push(`${col} = $${i++}`); params.push(val); };

  if (patch.patientName !== undefined) push('patient_name', String(patch.patientName || '').trim());
  if (patch.age        !== undefined)  push('age',       (patch.age === '' || patch.age == null) ? null : String(patch.age).trim());
  if (patch.village    !== undefined)  push('village',   (patch.village === '' || patch.village == null) ? null : String(patch.village).trim());
  if (patch.diagnosis  !== undefined)  push('diagnosis', (patch.diagnosis === '' || patch.diagnosis == null) ? null : String(patch.diagnosis).trim());
  if (patch.doa        !== undefined)  push('doa',       patch.doa || null);
  if (patch.dod        !== undefined)  push('dod',       patch.dod || null);
  if (patch.amount     !== undefined) {
    const n = Number(patch.amount);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'amount must be a non-negative number');
    push('amount', n.toFixed(2));
  }
  if (patch.receiptNumber !== undefined) {
    const n = Number(patch.receiptNumber);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, 'receiptNumber must be a positive integer');
    }
    push('receipt_number', n);
  }
  if (!set.length) throw new HttpError(400, 'Nothing to update');

  set.push(`updated_at = NOW()`);
  params.push(id);

  let rows;
  try {
    ({ rows } = await pool.query(
      `UPDATE three_c_ipd_entries SET ${set.join(', ')} WHERE id = $${i} RETURNING id`,
      params
    ));
  } catch (e) {
    // Unique constraint on (fy_key, receipt_number) — surface as 409.
    if (e.code === '23505') {
      throw new HttpError(409, 'Receipt # already used in this Financial Year');
    }
    throw e;
  }
  if (!rows[0]) throw new HttpError(404, 'Entry not found');
  const { rows: full } = await pool.query(`${IPD_SELECT} WHERE id = $1`, [id]);
  return hydrateIpd(full[0]);
};

const removeThreeCIpd = async (id) => {
  await ensureIpdTable();
  const { rowCount } = await pool.query(
    `DELETE FROM three_c_ipd_entries WHERE id = $1`, [id]
  );
  if (!rowCount) throw new HttpError(404, 'Entry not found');
};

/**
 * Auto-populate a register row from a fully-hydrated admission (the shape
 * returned by ipdService.admissions.getById). Idempotent: if an entry with
 * this admission_id already exists we return null and touch nothing — so
 * re-invocations (retries, replays) are safe.
 *
 * Amount is left at 0 so the admin can fill it in on the register page.
 */
const createIpdEntryFromAdmission = async (admission, userId) => {
  if (!admission || !admission.id) return null;
  await ensureIpdTable();

  const { rows: dup } = await pool.query(
    `SELECT id FROM three_c_ipd_entries WHERE admission_id = $1 LIMIT 1`,
    [admission.id]
  );
  if (dup[0]) return null;

  const toIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  return createThreeCIpd({
    admissionId: admission.id,
    patientName: admission.patientName,
    age:         admission.age != null ? String(admission.age) : null,
    village:     admission.village || null,
    diagnosis:   admission.admissionDiagnosis || null,
    doa:         toIso(admission.admittedAt),
    dod:         toIso(admission.dischargedAt),
    amount:      0,
    userId,
  });
};

/**
 * Landscape A4 PDF matching the OPD register's letterhead style.
 */
const threeCIpdPdf = async ({ fromDate, toDate }) => {
  const { rows, summary } = await listThreeCIpd({ fromDate, toDate });
  const settings = await settingsService.getAll();
  const clinicName = (settings.clinic_name || 'FEFSA HOSPITAL').toUpperCase();
  const doctorName = settings.doctor_name || 'Dr. Ajit B. Patel';

  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE = { w: 841.89, h: 595.28 }; // landscape A4
  const M = { left: 32, right: 32, top: 34, bottom: 34 };
  const contentW = PAGE.w - M.left - M.right;
  const tableRight = M.left + contentW;

  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.4, 0.4, 0.4);
  const rule = rgb(0.35, 0.35, 0.35);
  const accent = rgb(0.05, 0.32, 0.46);

  const cols = [
    { key: 'reg',       label: 'Reg. No.',    w: 68,  align: 'center' },
    { key: 'name',      label: 'Name',        w: 0,   align: 'left'   }, // fills
    { key: 'age',       label: 'Age',         w: 40,  align: 'center' },
    { key: 'village',   label: 'Address',     w: 110, align: 'left'   },
    { key: 'diagnosis', label: 'Diagnosis',   w: 150, align: 'left'   },
    { key: 'doa',       label: 'DOA',         w: 62,  align: 'center' },
    { key: 'dod',       label: 'DOD',         w: 62,  align: 'center' },
    { key: 'amount',    label: 'Amount',      w: 66,  align: 'right'  },
    { key: 'receipt',   label: 'Receipt #',   w: 62,  align: 'center' },
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[1].w = contentW - fixedW;
  const colX = [];
  { let x = M.left; for (const c of cols) { colX.push(x); x += c.w; } }

  const ROW_H = 20;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M.top;

  // Letterhead — same layout as OPD register (logo left, clinic centered, doctor right).
  const logoPath = path.resolve(env.UPLOAD_DIR, 'branding', 'logo.png');
  let logoImg = null;
  if (fs.existsSync(logoPath)) {
    try {
      const bytes = await fs.promises.readFile(logoPath);
      try { logoImg = await pdf.embedPng(bytes); }
      catch { logoImg = await pdf.embedJpg(bytes); }
    } catch { /* no logo */ }
  }
  const HEAD_H = 54;
  if (logoImg) {
    const target = 44;
    const scale = Math.min(target / logoImg.width, target / logoImg.height);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: M.left,
      y: y - HEAD_H + (HEAD_H - lh) / 2,
      width: lw, height: lh,
    });
  }
  const nameSize = 18;
  const nameW = fontBold.widthOfTextAtSize(clinicName, nameSize);
  page.drawText(clinicName, {
    x: M.left + (contentW - nameW) / 2, y: y - 22,
    size: nameSize, font: fontBold, color: accent,
  });
  const drSize = 11;
  const drW = fontBold.widthOfTextAtSize(doctorName, drSize);
  page.drawText(doctorName, {
    x: tableRight - drW, y: y - 22,
    size: drSize, font: fontBold, color: ink,
  });
  const tagline = 'Chest Physician';
  const tagW = font.widthOfTextAtSize(tagline, 10);
  page.drawText(tagline, {
    x: M.left + (contentW - tagW) / 2, y: y - 40,
    size: 10, font, color: muted,
  });
  y -= HEAD_H;
  page.drawLine({
    start: { x: M.left, y }, end: { x: tableRight, y },
    thickness: 0.8, color: accent,
  });
  y -= 18;

  page.drawText('3C Register IPD', { x: M.left, y, size: 14, font: fontBold, color: ink });
  const range = fromDate && toDate ? `${fmtDate(fromDate)}  to  ${fmtDate(toDate)}` : 'All entries';
  page.drawText(range, {
    x: tableRight - font.widthOfTextAtSize(range, 10),
    y, size: 10, font, color: muted,
  });
  y -= 20;

  const drawHRule = (yLine) =>
    page.drawLine({
      start: { x: M.left, y: yLine }, end: { x: tableRight, y: yLine },
      thickness: 0.6, color: rule,
    });
  const drawVRules = (yTop, yBottom) => {
    let x = M.left;
    for (const c of cols) {
      page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.6, color: rule });
      x += c.w;
    }
    page.drawLine({ start: { x: tableRight, y: yTop }, end: { x: tableRight, y: yBottom }, thickness: 0.6, color: rule });
  };
  const clip = (s, maxW, f, size) => {
    let str = String(s ?? '');
    if (f.widthOfTextAtSize(str, size) <= maxW) return str;
    while (str.length > 1 && f.widthOfTextAtSize(str + '…', size) > maxW) str = str.slice(0, -1);
    return str + '…';
  };
  const drawCell = (txt, i, opts = {}) => {
    const { size = 9, bold = false, color = ink, padX = 4 } = opts;
    const f = bold ? fontBold : font;
    const c = cols[i];
    const x0 = colX[i];
    const s = clip(txt, c.w - padX * 2, f, size);
    const tw = f.widthOfTextAtSize(s, size);
    let x = x0 + padX;
    if (c.align === 'center') x = x0 + (c.w - tw) / 2;
    if (c.align === 'right')  x = x0 + c.w - tw - padX;
    page.drawText(s, { x, y, size, font: f, color });
  };
  const drawHeader = () => {
    const yTop = y, yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.93, 0.95, 0.98),
    });
    drawHRule(yTop); drawHRule(yBottom); drawVRules(yTop, yBottom);
    y -= 14;
    cols.forEach((c, i) => drawCell(c.label, i, { size: 9, bold: true, color: muted }));
    y = yBottom;
  };
  const ensureRow = () => {
    if (y - ROW_H < M.bottom + 40) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M.top;
      drawHeader();
    }
  };

  drawHeader();

  if (!rows.length) {
    y -= 30;
    page.drawText('No entries in this range.', { x: M.left, y, size: 11, font, color: muted });
  } else {
    for (const r of rows) {
      ensureRow();
      const yTop = y, yBottom = y - ROW_H;
      drawHRule(yBottom); drawVRules(yTop, yBottom);
      y -= 14;
      drawCell(r.registrationNumber,         0);
      drawCell(r.patientName,                1);
      drawCell(r.age || '',                  2);
      drawCell(r.village || '',              3);
      drawCell(r.diagnosis || '',            4);
      drawCell(r.doa ? fmtDate(r.doa) : '',  5);
      drawCell(r.dod ? fmtDate(r.dod) : '',  6);
      drawCell(fmtMoney(r.amount),           7);
      drawCell(String(r.receiptNumber),      8);
      y = yBottom;
    }
    ensureRow();
    const yTop = y, yBottom = y - ROW_H;
    page.drawRectangle({
      x: M.left, y: yBottom, width: contentW, height: ROW_H,
      color: rgb(0.97, 0.98, 1),
    });
    drawHRule(yTop); drawHRule(yBottom); drawVRules(yTop, yBottom);
    y -= 14;
    drawCell(`${summary.count} entries`, 1, { bold: true });
    drawCell(fmtMoney(summary.amount),   7, { bold: true });
    y = yBottom;
  }

  const sigY = M.bottom + 46;
  const drNameW = fontBold.widthOfTextAtSize(doctorName, 12);
  page.drawText(doctorName, { x: tableRight - drNameW, y: sigY, size: 12, font: fontBold, color: ink });
  const subW = font.widthOfTextAtSize('Chest Physician', 10);
  page.drawText('Chest Physician', { x: tableRight - subW, y: sigY - 14, size: 10, font, color: muted });

  page.drawText(
    `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    { x: M.left, y: M.bottom - 8, size: 8, font, color: muted }
  );

  return pdf.save();
};

module.exports = {
  threeCRegister,
  threeCRegisterPdf,
  threeCRegisterDetail,
  threeCRegisterDetailPdf,
  setThreeCAmount,
  listThreeCIpd,
  createThreeCIpd,
  updateThreeCIpd,
  removeThreeCIpd,
  threeCIpdPdf,
  createIpdEntryFromAdmission,
};
