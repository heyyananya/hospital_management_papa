/**
 * Indoor Sheet — printable PDF.
 *
 * Portrait A4. Layout mirrors the on-screen day block: one letterhead +
 * patient panel at the top, followed by one bordered block per recorded
 * day. Each block splits into MEDICINES on the left (14 lines × 4 cols)
 * and VITALS on the right (Time × Pulse/BP/SpO₂) with Steam / Chest PT
 * counters below.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const env = require('../config/env');
const settingsService = require('./settingsService');
const ipdService = require('./ipdService');

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

// Standard-14 fonts (Helvetica etc.) only support the WinAnsi range —
// anything outside U+0000..U+00FF throws when drawn. Replace the common
// clinical symbols we care about, then strip whatever's left so a user's
// diagnosis/name with an unexpected glyph never nukes the whole PDF.
const WINANSI_SAFE_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '—': '-', '–': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '…': '...',
  ' ': ' ',  // NBSP
};
const safeAnsi = (v) => {
  const s = String(v ?? '');
  let out = '';
  for (const ch of s) {
    if (ch.charCodeAt(0) <= 0xff) { out += ch; continue; }
    if (WINANSI_SAFE_MAP[ch] !== undefined) { out += WINANSI_SAFE_MAP[ch]; continue; }
    out += '?';   // last-resort placeholder
  }
  return out;
};

exports.render = async (admissionId) => {
  const { admission, days } = await ipdService.indoorSheet.get(admissionId);
  const settings = await settingsService.getAll();
  const clinicName = (settings.clinic_name || 'FEFSA HOSPITAL').toUpperCase();
  const doctorName = settings.doctor_name || 'Dr. Ajit B. Patel';
  const address    = settings.clinic_address ||
    'B1-Block, Medipolis, Deesa Highway, Palanpur-385001 (Dist. B.K.)';
  const phone      = settings.clinic_phone || '90 99 41 66 82, 88 66 44 48 17';

  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE = { w: 595.28, h: 841.89 }; // A4 portrait
  const M = { left: 28, right: 28, top: 28, bottom: 28 };
  const contentW = PAGE.w - M.left - M.right;
  const tableRight = M.left + contentW;

  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.42, 0.42, 0.42);
  const rule = rgb(0.35, 0.35, 0.35);
  const accent = rgb(0.05, 0.32, 0.46);
  const softBg  = rgb(0.945, 0.965, 0.985);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M.top;

  // -------- letterhead helpers --------------------------------------
  let logoImg = null;
  const logoPath = path.resolve(env.UPLOAD_DIR, 'branding', 'logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const bytes = await fs.promises.readFile(logoPath);
      try { logoImg = await pdf.embedPng(bytes); }
      catch { logoImg = await pdf.embedJpg(bytes); }
    } catch { /* no logo */ }
  }

  const drawLetterhead = () => {
    // The letterhead is a two-column layout:
    //   LEFT: logo + clinic name + address + phone
    //   RIGHT: doctor name + qualifications
    //
    // Reserving a right-edge budget for the doctor block means the address
    // can wrap safely at the same width — that's what used to collide with
    // the INDOOR SHEET title (which now sits on its own line, below).
    const HEAD_H = 62;
    if (logoImg) {
      const target = 50;
      const scale = Math.min(target / logoImg.width, target / logoImg.height);
      const lw = logoImg.width * scale;
      const lh = logoImg.height * scale;
      page.drawImage(logoImg, {
        x: M.left, y: y - HEAD_H + (HEAD_H - lh) / 2,
        width: lw, height: lh,
      });
    }
    // Reserve horizontal room for the doctor block on the right so long
    // addresses can't collide with it.
    const DOC_BLOCK_W = 170;
    const infoLeft = M.left + 60;
    const infoMaxW = tableRight - DOC_BLOCK_W - infoLeft - 8;

    page.drawText(safeAnsi(clinicName), {
      x: infoLeft, y: y - 14, size: 15, font: fontBold, color: accent,
    });
    // Clip address + phone to the info column width so nothing runs into
    // the right side of the header.
    const clipInline = (s, size, f = font) => {
      let str = safeAnsi(s);
      if (f.widthOfTextAtSize(str, size) <= infoMaxW) return str;
      while (str.length > 1 && f.widthOfTextAtSize(str + '...', size) > infoMaxW) str = str.slice(0, -1);
      return str + '...';
    };
    page.drawText(clipInline(address, 8), {
      x: infoLeft, y: y - 30, size: 8, font, color: muted,
    });
    page.drawText(clipInline(`Mo. ${phone}`, 8), {
      x: infoLeft, y: y - 42, size: 8, font, color: muted,
    });

    // Doctor block (right column, fixed width)
    const drSize = 11;
    const doctorSafe = safeAnsi(doctorName);
    const drW = fontBold.widthOfTextAtSize(doctorSafe, drSize);
    page.drawText(doctorSafe, {
      x: tableRight - drW, y: y - 14, size: drSize, font: fontBold, color: ink,
    });
    page.drawText('MB. DTCD (Chest)', {
      x: tableRight - font.widthOfTextAtSize('MB. DTCD (Chest)', 8.5), y: y - 27,
      size: 8.5, font, color: muted,
    });
    page.drawText('Reg. No. G-32059', {
      x: tableRight - font.widthOfTextAtSize('Reg. No. G-32059', 8.5), y: y - 38,
      size: 8.5, font, color: muted,
    });
    page.drawText('Consulting Pulmonologist', {
      x: tableRight - fontBold.widthOfTextAtSize('Consulting Pulmonologist', 8.5), y: y - 49,
      size: 8.5, font: fontBold, color: ink,
    });

    // Horizontal rule below the two-column header.
    y -= HEAD_H + 4;
    page.drawLine({
      start: { x: M.left, y }, end: { x: tableRight, y },
      thickness: 0.8, color: rule,
    });

    // INDOOR SHEET title — clean bold text centered under the rule.
    // No box (the framed version made the letterhead feel busy); widely
    // tracked letter-spacing so it reads like a section banner. Extra
    // padding above and below so it doesn't feel crammed against the
    // horizontal rule or the patient panel underneath.
    y -= 18;
    const titleText  = 'I N D O O R   S H E E T';
    const titleSize  = 14;
    const titleW     = fontBold.widthOfTextAtSize(titleText, titleSize);
    const titleX     = M.left + (contentW - titleW) / 2;
    page.drawText(titleText, {
      x: titleX, y, size: titleSize, font: fontBold, color: accent,
    });
    // Subtle centered underline so the title still reads as a section
    // separator without the boxed frame.
    const underlineLen = titleW + 24;
    const underlineX   = M.left + (contentW - underlineLen) / 2;
    page.drawLine({
      start: { x: underlineX,               y: y - 5 },
      end:   { x: underlineX + underlineLen, y: y - 5 },
      thickness: 0.6, color: accent,
    });
    y -= 22;
  };

  const drawPatientPanel = () => {
    const drawField = (label, value, x, w) => {
      page.drawText(`${label}:`, { x, y, size: 9, font, color: ink });
      const lw = font.widthOfTextAtSize(`${label}:`, 9);
      const s = safeAnsi(value);
      page.drawText(s, { x: x + lw + 4, y, size: 9, font: fontBold, color: ink });
      page.drawLine({
        start: { x: x + lw + 4, y: y - 2 }, end: { x: x + w, y: y - 2 },
        thickness: 0.4, color: muted,
      });
    };
    const ageSex = `${admission.age || ''}${admission.gender ? ' / ' + admission.gender : ''}`;
    drawField('Name',    admission.patientName,           M.left,        260);
    drawField('Age/Sex', ageSex,                          M.left + 270,  95);
    drawField('Room',    admission.bedNumber || '',       M.left + 370,  55);
    drawField('Ward',    admission.wardName  || '',       M.left + 430, 100);
    y -= 14;
    drawField('Address', admission.village || '',         M.left,        360);
    drawField('DOA',     fmtDate(admission.admittedAt),   M.left + 370,   70);
    drawField('DOD',     fmtDate(admission.dischargedAt), M.left + 450,   80);
    y -= 14;
    drawField('Diagnosis', admission.admissionDiagnosis || '', M.left, contentW);
    y -= 12;
  };

  drawLetterhead();
  drawPatientPanel();

  // -------- day block ------------------------------------------------
  //
  // Layout constants tuned so exactly TWO day blocks fit on one A4 page,
  // with the letterhead and patient panel at the top. Rows are sized to
  // fill the page — leaving too much bottom whitespace looks empty when
  // printed, so we distribute the available height across the rows.
  //
  //   Available body area (after letterhead + patient panel + signature):
  //     the "INDOOR SHEET" title and underline eat ~40 pt more than the
  //     older boxed version, so the blocks are trimmed a hair to keep two
  //     of them safely above the doctor's signature at the bottom.
  //   Block height = 274 pt · Block gap = 16 pt → 2 blocks = 564 pt. Fits.
  //
  const MED_ROWS_PDF   = 14;
  const MED_HEADER_H   = 16;
  const MED_ROW_H      = 17;
  const MED_TABLE_H    = MED_HEADER_H + MED_ROWS_PDF * MED_ROW_H; // 254
  const VIT_HEADER_H   = 16;
  const VIT_ROW_H      = 24;
  const VIT_TABLE_H    = VIT_HEADER_H + 3 * VIT_ROW_H;            // 88
  const STRIP_H        = 46;
  const STRIP_GAP      = 12;
  const RIGHT_STACK_H  = VIT_TABLE_H + STRIP_GAP + STRIP_H;       // 146
  const BODY_H         = Math.max(MED_TABLE_H, RIGHT_STACK_H);    // 254
  const BLOCK_HEADER_H = 20;
  const BLOCK_H        = BLOCK_HEADER_H + BODY_H;                 // 274
  const BLOCK_GAP      = 16;

  const VIT_TIME_COL = 48;
  const MED_COL_W    = { num: 22, med: 0, dose: 50, route: 44, freq: 56 };

  // Day-of-stay number. We compare *date only* (year-month-day) so a patient
  // admitted late evening on day X still shows Day 2 for records dated X+1.
  // The old version used raw millisecond diff, which produced repeated
  // "Day 1"s whenever the time-of-day gap was less than 24 h.
  //
  // Handles both Date objects (default pg output) and 'YYYY-MM-DD' strings
  // (some drivers/config return DATE as a plain string) — we care about the
  // calendar day the timestamp represents in local time either way.
  const startOfLocalDay = (d) => {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
      const [y, m, day] = d.slice(0, 10).split('-').map(Number);
      return Date.UTC(y, m - 1, day);
    }
    const x = new Date(d);
    return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  };
  const computeDayNo = (readingDate) => {
    if (!admission.admittedAt) return 1;
    const a = startOfLocalDay(admission.admittedAt);
    const r = startOfLocalDay(readingDate);
    return Math.max(1, Math.round((r - a) / 86400000) + 1);
  };

  // pdf-lib's Standard-14 fonts can't render anything outside WinAnsi, so
  // sanitize + use an ASCII ellipsis when we have to truncate.
  const clip = (s, maxW, size) => {
    let str = safeAnsi(s);
    if (font.widthOfTextAtSize(str, size) <= maxW) return str;
    while (str.length > 1 && font.widthOfTextAtSize(str + '...', size) > maxW) str = str.slice(0, -1);
    return str + '...';
  };

  const drawDayBlock = (block) => {
    const dayNo = computeDayNo(block.readingDate);
    const dateLabel = fmtDate(block.readingDate);

    // Page break if the block doesn't fit above the signature/footer area.
    // Threshold accounts for the signature block ("Dr. …" line + subtitle)
    // plus a small margin so the last block never kisses the signature.
    if (y - BLOCK_H < M.bottom + 60) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M.top;
      drawLetterhead();
      drawPatientPanel();
    }

    // ----- Block header (Day N + Date) --------------------------
    const yTop = y;
    page.drawRectangle({
      x: M.left, y: yTop - BLOCK_HEADER_H, width: contentW, height: BLOCK_HEADER_H,
      color: softBg, borderColor: rule, borderWidth: 0.5,
    });
    page.drawText(`Day ${dayNo}`, {
      x: M.left + 10, y: yTop - 14, size: 12, font: fontBold, color: accent,
    });
    page.drawText(safeAnsi(dateLabel), {
      x: M.left + 78, y: yTop - 14, size: 12, font: fontBold, color: ink,
    });
    const bodyTop = yTop - BLOCK_HEADER_H;

    // ----- Column layout ----------------------------------------
    const leftW = Math.round(contentW * 0.62);
    const rightW = contentW - leftW;
    const rightX = M.left + leftW;

    // ----- MEDICINES table (left) -------------------------------
    MED_COL_W.med = leftW - (MED_COL_W.num + MED_COL_W.dose + MED_COL_W.route + MED_COL_W.freq);
    const medCols = [
      { label: '#',        w: MED_COL_W.num,   align: 'center' },
      { label: 'Medicine', w: MED_COL_W.med,   align: 'left'   },
      { label: 'Dose',     w: MED_COL_W.dose,  align: 'center' },
      { label: 'Route',    w: MED_COL_W.route, align: 'center' },
      { label: 'Freq',     w: MED_COL_W.freq,  align: 'center' },
    ];
    // Header row
    page.drawRectangle({
      x: M.left, y: bodyTop - MED_HEADER_H, width: leftW, height: MED_HEADER_H,
      color: rgb(0.96, 0.97, 0.99), borderColor: rule, borderWidth: 0.4,
    });
    let cx = M.left;
    for (const c of medCols) {
      const tw = fontBold.widthOfTextAtSize(c.label, 9.5);
      let x = cx + 4;
      if (c.align === 'center') x = cx + (c.w - tw) / 2;
      page.drawText(c.label, { x, y: bodyTop - 12, size: 9.5, font: fontBold, color: muted });
      cx += c.w;
    }
    // Data rows + vertical rules
    const lines = Array.isArray(block.medicineLines) ? block.medicineLines : [];
    for (let i = 0; i < MED_ROWS_PDF; i++) {
      const rowY = bodyTop - MED_HEADER_H - (i + 1) * MED_ROW_H;
      page.drawRectangle({
        x: M.left, y: rowY, width: leftW, height: MED_ROW_H,
        borderColor: rule, borderWidth: 0.3,
      });
      let vx = M.left;
      for (const c of medCols) {
        page.drawLine({
          start: { x: vx, y: rowY }, end: { x: vx, y: rowY + MED_ROW_H },
          thickness: 0.3, color: rule,
        });
        vx += c.w;
      }
      const l = lines[i] || {};
      const cells = [String(i + 1), l.med || '', l.dose || '', l.route || '', l.freq || ''];
      cx = M.left;
      cells.forEach((val, ci) => {
        const c = medCols[ci];
        const s = clip(val, c.w - 6, 9.5);
        const tw = font.widthOfTextAtSize(s, 9.5);
        let x = cx + 4;
        if (c.align === 'center') x = cx + (c.w - tw) / 2;
        page.drawText(s, { x, y: rowY + 5, size: 9.5, font, color: ink });
        cx += c.w;
      });
    }

    // ----- VITALS table (right, top half) -----------------------
    const vitCols = [
      { label: 'Time',  w: VIT_TIME_COL, align: 'center' },
      { label: '10 AM', w: 0, align: 'center' },
      { label: '4 PM',  w: 0, align: 'center' },
      { label: '10 PM', w: 0, align: 'center' },
      { label: '6 AM',  w: 0, align: 'center' },
    ];
    const slotW = Math.floor((rightW - VIT_TIME_COL) / 4);
    for (let i = 1; i < 5; i++) vitCols[i].w = slotW;
    // Header row
    page.drawRectangle({
      x: rightX, y: bodyTop - VIT_HEADER_H, width: rightW, height: VIT_HEADER_H,
      color: rgb(0.96, 0.97, 0.99), borderColor: rule, borderWidth: 0.4,
    });
    cx = rightX;
    for (const c of vitCols) {
      const tw = fontBold.widthOfTextAtSize(c.label, 9.5);
      let x = cx + 4;
      if (c.align === 'center') x = cx + (c.w - tw) / 2;
      page.drawText(c.label, { x, y: bodyTop - 12, size: 9.5, font: fontBold, color: muted });
      cx += c.w;
    }
    const vitalRows = [
      { label: 'Pulse', keys: ['pulse10am','pulse4pm','pulse10pm','pulse6am'] },
      { label: 'BP',    keys: ['bp10am',   'bp4pm',   'bp10pm',   'bp6am'   ] },
      { label: 'SpO2',  keys: ['spo210am', 'spo24pm', 'spo210pm', 'spo26am' ] },
    ];
    vitalRows.forEach((row, ri) => {
      const rowY = bodyTop - VIT_HEADER_H - (ri + 1) * VIT_ROW_H;
      page.drawRectangle({
        x: rightX, y: rowY, width: rightW, height: VIT_ROW_H,
        borderColor: rule, borderWidth: 0.3,
      });
      page.drawRectangle({
        x: rightX, y: rowY, width: VIT_TIME_COL, height: VIT_ROW_H,
        color: rgb(0.98, 0.98, 0.98),
      });
      page.drawText(row.label, {
        x: rightX + 8, y: rowY + VIT_ROW_H / 2 - 4, size: 10, font: fontBold, color: ink,
      });
      let vx2 = rightX;
      for (const c of vitCols) {
        page.drawLine({
          start: { x: vx2, y: rowY }, end: { x: vx2, y: rowY + VIT_ROW_H },
          thickness: 0.3, color: rule,
        });
        vx2 += c.w;
      }
      cx = rightX + VIT_TIME_COL;
      row.keys.forEach((k, ki) => {
        const c = vitCols[ki + 1];
        const val = String(block[k] || '');
        const s = clip(val, c.w - 6, 10);
        const tw = font.widthOfTextAtSize(s, 10);
        const x = cx + (c.w - tw) / 2;
        page.drawText(s, { x, y: rowY + VIT_ROW_H / 2 - 4, size: 10, font, color: ink });
        cx += c.w;
      });
    });

    // ----- STEAM / CHEST P.T. strip (right column, bottom edge) -
    //
    // Positioned to line up with the BOTTOM of the medicine table on the
    // left — matching the paper form, where Steam / Chest P.T. sit under
    // row 14. Between the vitals table (top of right col) and this strip
    // there's deliberately empty vertical space, same as the printed form.
    const stripBot = bodyTop - BODY_H;               // aligned with row-14 baseline
    const stripTop = stripBot + STRIP_H;             // top edge (higher y)
    page.drawRectangle({
      x: rightX, y: stripBot, width: rightW, height: STRIP_H,
      borderColor: rule, borderWidth: 0.4, color: rgb(0.985, 0.99, 1),
    });
    // Center the two rows vertically inside the strip.
    const rowSpacing   = 22;
    const totalTextH   = 2 * 10 + rowSpacing - 10; // two text baselines
    const firstBaseY   = stripTop - (STRIP_H - totalTextH) / 2 - 3;
    const secondBaseY  = firstBaseY - rowSpacing;

    const drawCounter = (label, am, pm, baseY) => {
      page.drawText(label, {
        x: rightX + 10, y: baseY, size: 10, font: fontBold, color: ink,
      });
      // Two boxes: AM / PM
      const BOX_W = 28;
      const BOX_H = 14;
      const bx = rightX + 96;
      const bxAM = bx;
      const bxPM = bx + BOX_W + 36;
      // Labels above the boxes ("AM" / "PM")
      page.drawText('AM', { x: bxAM - 17, y: baseY, size: 8.5, font, color: muted });
      page.drawText('PM', { x: bxPM - 17, y: baseY, size: 8.5, font, color: muted });
      // Boxes vertically centered on the baseline
      const boxY = baseY - 3;
      page.drawRectangle({ x: bxAM, y: boxY, width: BOX_W, height: BOX_H, borderColor: rule, borderWidth: 0.6 });
      page.drawRectangle({ x: bxPM, y: boxY, width: BOX_W, height: BOX_H, borderColor: rule, borderWidth: 0.6 });
      const amS = safeAnsi(am ?? 0);
      const pmS = safeAnsi(pm ?? 0);
      page.drawText(amS, {
        x: bxAM + (BOX_W - font.widthOfTextAtSize(amS, 10)) / 2,
        y: boxY + 3, size: 10, font, color: ink,
      });
      page.drawText(pmS, {
        x: bxPM + (BOX_W - font.widthOfTextAtSize(pmS, 10)) / 2,
        y: boxY + 3, size: 10, font, color: ink,
      });
    };
    drawCounter('Steam',      block.steam,   block.steamPm,   firstBaseY);
    drawCounter('Chest P.T.', block.chestPt, block.chestPtPm, secondBaseY);

    // Advance y to below the whole block, ready for the next one.
    y = bodyTop - BODY_H - BLOCK_GAP;
  };

  if (!days.length) {
    y -= 20;
    page.drawText('No entries recorded yet.', {
      x: M.left, y, size: 11, font, color: muted,
    });
  } else {
    days.forEach(drawDayBlock);
  }

  // Signature
  const sigY = M.bottom + 40;
  const doctorSigSafe = safeAnsi(doctorName);
  const drNameW = fontBold.widthOfTextAtSize(doctorSigSafe, 11);
  page.drawText(doctorSigSafe, {
    x: tableRight - drNameW, y: sigY, size: 11, font: fontBold, color: ink,
  });
  const sigSub = 'Consulting Pulmonologist';
  const subW = font.widthOfTextAtSize(sigSub, 9);
  page.drawText(sigSub, {
    x: tableRight - subW, y: sigY - 12, size: 9, font, color: muted,
  });
  page.drawText(
    safeAnsi(`Printed ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`),
    { x: M.left, y: M.bottom - 6, size: 7.5, font, color: muted }
  );

  return pdf.save();
};
