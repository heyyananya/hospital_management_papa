/**
 * Bill PDF generator — FEFSA Hospital OPD receipt (A5 portrait).
 *
 * Design goals:
 *  - Premium, elegant, print-perfect receipt on a single A5 page (148 x 210 mm).
 *  - Content occupies ~88% of the page so margins look comfortable, not crowded.
 *  - Three-column header with each column vertically centred and tight spacing.
 *  - Hospital info strip (address | phone) flanked by subtle rules.
 *  - OPD No. + Date on a flex-style row.
 *  - Patient info: bordered card; Name spans full width, then three balanced
 *    two-column rows with equal heights and aligned label / value columns.
 *  - Services table with a soft-green header and a Net Amount row in the
 *    same band so it reads as a single, calm unit.
 *  - "Amount in Words" rendered in Title Case ("Six Hundred Rupees Only").
 *  - Centred grey footer ("Thank You for Visiting / Get Well Soon") below
 *    the right-aligned "For, FEFSA HOSPITAL" sign-off.
 *  - Hospital-logo watermark at ~3% opacity behind every element.
 *
 * Fixed labels and hospital-specific text fall back to FEFSA defaults so a
 * fresh install renders a complete receipt even before Settings is filled.
 */
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const billsService = require('./billsService');
const settingsService = require('./settingsService');
const { LOGO_PATH } = require('../controllers/settingsController');

// A5 = 148mm x 210mm at 72 dpi.
const A5 = { width: 419.53, height: 595.28 };

/* ---------- FEFSA defaults (used when a setting is blank) ---------- */
const DEFAULTS = {
  clinic_name:           'FEFSA HOSPITAL',
  doctor_name:           'Dr. Ajit B. Patel',
  doctor_qualifications: 'MB., DTCD. (Chest)',
  doctor_designation:    'Gujarat University First Pulmonologist\nB. J. Medical College, Ahmedabad',
  hospital_tagline:      'Asthma, Cough, Allergy, Pneumonia, Cancer, TB, Chest Pain',
  clinic_address:        'B-Block, Medipolis, Deesa Highway, Palanpur. (Banaskantha)',
  clinic_phone:          '90 99 41 66 82,  88 66 44 48 17',
  receipt_footer:        'Thank You for Visiting',
};

/* -------------------------- helpers -------------------------------- */

const hex = (h) => {
  const m = h.replace('#', '');
  return rgb(
    parseInt(m.slice(0, 2), 16) / 255,
    parseInt(m.slice(2, 4), 16) / 255,
    parseInt(m.slice(4, 6), 16) / 255,
  );
};

const money = (n) => Number(n || 0).toFixed(2);

const wrap = (text, font, size, max) => {
  const out = [];
  String(text || '').split(/\r?\n/).forEach((para) => {
    if (!para.trim()) { out.push(''); return; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const tryLine = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(tryLine, size) > max) {
        if (line) out.push(line);
        line = w;
      } else line = tryLine;
    }
    if (line) out.push(line);
  });
  return out;
};

/**
 * Indian numbering convention number-to-words in Title Case.
 *   1234 -> "One Thousand Two Hundred Thirty Four"
 *   100000 -> "One Lakh"
 */
const numberToWords = (num) => {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'Zero';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigit = (n) => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10), o = n % 10;
    return tens[t] + (o ? ' ' + ones[o] : '');
  };
  const threeDigit = (n) => {
    const h = Math.floor(n / 100), r = n % 100;
    let s = '';
    if (h) s += ones[h] + ' Hundred';
    if (r) s += (s ? ' ' : '') + twoDigit(r);
    return s;
  };

  const crore = Math.floor(num / 10000000);
  const lakh  = Math.floor((num % 10000000) / 100000);
  const thou  = Math.floor((num % 100000) / 1000);
  const rest  = num % 1000;
  const parts = [];
  if (crore) parts.push(twoDigit(crore) + ' Crore');
  if (lakh)  parts.push(twoDigit(lakh)  + ' Lakh');
  if (thou)  parts.push(twoDigit(thou)  + ' Thousand');
  if (rest)  parts.push(threeDigit(rest));
  return parts.join(' ');
};

const amountInWords = (n) => {
  const v = Number(n) || 0;
  const r = Math.floor(v);
  const p = Math.round((v - r) * 100);
  let s = `${numberToWords(r)} Rupees`;
  if (p > 0) s += ` and ${numberToWords(p)} Paise`;
  return `${s} Only`;
};

/* ------------------------- build the bill -------------------------- */

const buildBillPdf = async (billId) => {
  const [bill, settingsRaw] = await Promise.all([
    billsService.getBill(billId),
    settingsService.getAll(),
  ]);

  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (settingsRaw[k] && String(settingsRaw[k]).trim()) s[k] = settingsRaw[k];
  }

  const pdf  = await PDFDocument.create();
  const page = pdf.addPage([A5.width, A5.height]);
  const W = A5.width;
  const H = A5.height;

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  /* -------------------- palette -------------------- */
  const PRIMARY    = hex('#0B7A4A');
  const SOFT_GREEN = hex('#EDF7F2');
  const BORDER     = hex('#D7E7DF');
  const INK        = hex('#1F2937');
  const MUTED      = hex('#6B7280');

  /* -------------------- geometry -------------------- */
  // ~12mm margins → content uses ~88% of the A5 page.
  const M = 32;
  const L = M, R = W - M, T = H - M, B = M;
  const contentW = R - L;

  /* ============ WATERMARK (drawn first, behind everything) ============ */
  let logoImg = null;
  if (fs.existsSync(LOGO_PATH)) {
    try {
      const bytes = await fs.promises.readFile(LOGO_PATH);
      try { logoImg = await pdf.embedPng(bytes); }
      catch { logoImg = await pdf.embedJpg(bytes); }
    } catch { /* ignore */ }
  }
  if (logoImg) {
    const target = 260;
    const scale = Math.min(target / logoImg.width, target / logoImg.height);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: (W - lw) / 2,
      y: (H - lh) / 2,
      width: lw, height: lh,
      opacity: 0.035,                    // 3.5%, subtly visible, never noisy
    });
  }

  /* ============ HEADER (three columns, single horizontal line) ============ */
  // Layout discipline:
  //   - Hospital name (left), logo (center), doctor name (right) sit on the
  //     same horizontal baseline at the top of the header band.
  //   - The tagline flows below the hospital name; qualifications + designation
  //     flow below the doctor name. Each sub-line uses the same line-height so
  //     the two columns end at the same vertical position.
  //   - The logo's vertical centre matches the visual mid-line of the two text
  //     blocks so the whole header reads as a single balanced row.
  //   - "FEFSA HOSPITAL" gets a small character-spacing tracking adjustment
  //     for a premium letterhead feel and never wraps.
  const HEADER_H = 84;
  const headerTop = T;
  const headerBottom = headerTop - HEADER_H;

  const CENTER_W = 78;                  // reserved band for the logo
  const SIDE_W   = (contentW - CENTER_W) / 2;
  const COL_GAP  = 4;

  const lColX = L;
  const lColW = SIDE_W - COL_GAP;
  const rColX = L + SIDE_W + CENTER_W + COL_GAP;
  const rColW = SIDE_W - COL_GAP;

  // Sizes
  const nameSize  = 17;
  const docSize   = 13;
  const tagSize   = 8;
  const qualSize  = 9;
  const desigSize = 8;
  const subLH     = 10;                 // shared line-height for sub-content

  // "FEFSA HOSPITAL" tracking — auto-tunes so the name always fits on one
  // line without wrapping (premium look first, fits second).
  const computeNameTracking = () => {
    const baseW = bold.widthOfTextAtSize(s.clinic_name, nameSize);
    const charCount = s.clinic_name.length;
    if (charCount <= 1) return 0;
    const room = lColW - baseW;
    const ideal = 1.6;                  // ideal letter-spacing for a letterhead
    const maxPerGap = room / (charCount - 1);
    return Math.max(0, Math.min(ideal, maxPerGap - 0.2));
  };
  const nameTracking = computeNameTracking();

  // Both name baselines on the same Y, near the top of the header.
  const TOP_PAD = 6;
  const nameBaselineY = headerTop - TOP_PAD - Math.max(nameSize, docSize);

  // --- LEFT: hospital name (with tracking) + tagline ---
  page.drawText(s.clinic_name, {
    x: lColX, y: nameBaselineY,
    size: nameSize, font: bold, color: PRIMARY,
    characterSpacing: nameTracking,
  });
  const tagLines = wrap(s.hospital_tagline, font, tagSize, lColW).slice(0, 3);
  const tagStartY = nameBaselineY - 5 - tagSize;
  tagLines.forEach((ln, i) => {
    page.drawText(ln, {
      x: lColX, y: tagStartY - i * subLH,
      size: tagSize, font, color: MUTED,
    });
  });

  // --- RIGHT: doctor name + qualification + designation ---
  page.drawText(s.doctor_name, {
    x: rColX, y: nameBaselineY,
    size: docSize, font: bold, color: INK,
  });
  const qualY = nameBaselineY - 5 - qualSize;
  page.drawText(s.doctor_qualifications, {
    x: rColX, y: qualY,
    size: qualSize, font, color: INK,
  });
  const desigLines = wrap(s.doctor_designation, font, desigSize, rColW).slice(0, 3);
  const desigStartY = qualY - subLH;
  desigLines.forEach((ln, i) => {
    page.drawText(ln, {
      x: rColX, y: desigStartY - i * subLH,
      size: desigSize, font, color: MUTED,
    });
  });

  // --- CENTER: logo, vertical centre matched to the text-block mid-line ---
  // Bottom of each text block (whichever extends further):
  const lContentBottom = tagStartY - (Math.max(tagLines.length, 1) - 1) * subLH;
  const rContentBottom = desigStartY - (Math.max(desigLines.length, 1) - 1) * subLH;
  const textBottomY = Math.min(lContentBottom, rContentBottom);
  const textMidY = (nameBaselineY + textBottomY) / 2 + 2;   // +2 = optical lift
  if (logoImg) {
    const target = 70;
    const scale = Math.min(target / logoImg.width, target / logoImg.height);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: L + SIDE_W + (CENTER_W - lw) / 2,
      y: textMidY - lh / 2,
      width: lw, height: lh,
    });
  }

  let y = headerBottom - 4;

  // Heavy primary rule under header
  page.drawLine({
    start: { x: L, y }, end: { x: R, y },
    thickness: 1.3, color: PRIMARY,
  });
  y -= 12;

  /* ============ ADDRESS STRIP ============ */
  const addr = s.clinic_address;
  const phone = s.clinic_phone;
  const sepGap = 10;
  let addrSize = 8.5;
  let aw, pw, fullLineW;
  while (true) {
    aw = font.widthOfTextAtSize(addr, addrSize);
    pw = font.widthOfTextAtSize(phone, addrSize);
    fullLineW = aw + sepGap + 1 + sepGap + pw;
    if (fullLineW <= contentW || addrSize <= 7) break;
    addrSize -= 0.5;
  }
  if (fullLineW <= contentW) {
    const startX = L + (contentW - fullLineW) / 2;
    const sx = startX + aw + sepGap;
    page.drawText(addr, { x: startX, y, size: addrSize, font, color: INK });
    page.drawLine({
      start: { x: sx, y: y - 2 }, end: { x: sx, y: y + 9 },
      thickness: 0.6, color: BORDER,
    });
    page.drawText(phone, { x: sx + 1 + sepGap, y, size: addrSize, font, color: INK });
  } else {
    page.drawText(addr,
      { x: L + (contentW - aw) / 2, y, size: addrSize, font, color: INK });
    y -= 11;
    page.drawText(phone,
      { x: L + (contentW - pw) / 2, y, size: addrSize, font, color: INK });
  }
  y -= 10;

  // Thin rule below address
  page.drawLine({
    start: { x: L, y }, end: { x: R, y },
    thickness: 0.6, color: BORDER,
  });
  y -= 14;

  /* ============ RECEIPT INFO ROW ============ */
  const createdAt = new Date(bill.createdAt);
  const dateStr = createdAt.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
  const timeStr = createdAt.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  const lblSize = 9;
  const valSize = 10;

  const opdLbl = 'OPD Rec. No. :';
  page.drawText(opdLbl, { x: L, y, size: lblSize, font, color: MUTED });
  const opdLblW = font.widthOfTextAtSize(opdLbl, lblSize);
  page.drawText(bill.billNumber, {
    x: L + opdLblW + 6, y, size: valSize, font: bold, color: PRIMARY,
  });

  const dateLbl = 'Date :';
  const dLblW = font.widthOfTextAtSize(dateLbl, lblSize);
  const dValW = bold.widthOfTextAtSize(dateStr, valSize);
  const dateX = R - dValW - 6 - dLblW;
  page.drawText(dateLbl, { x: dateX, y, size: lblSize, font, color: MUTED });
  page.drawText(dateStr, {
    x: dateX + dLblW + 6, y, size: valSize, font: bold, color: INK,
  });
  y -= 14;

  /* ============ PATIENT INFO CARD ============ */
  // Name spans full width on row 1. Three two-column rows follow.
  const ROW_H = 17;
  const ROWS = 4;
  const pbPadV = 7;
  const pbTop = y;
  const pbH = ROWS * ROW_H + pbPadV * 2;
  const pbBottom = pbTop - pbH;

  page.drawRectangle({
    x: L, y: pbBottom, width: contentW, height: pbH,
    color: SOFT_GREEN,
    borderColor: BORDER, borderWidth: 0.8,
  });

  const halfW = contentW / 2;
  const LBL_W = 72;
  const PAD_X = 12;

  const lLabelX = L + PAD_X;
  const lColonX = lLabelX + LBL_W;
  const lValX   = lColonX + 8;

  const rLabelX = L + halfW + 6;
  const rColonX = rLabelX + LBL_W;
  const rValX   = rColonX + 8;

  const lValMaxW = halfW - (lValX - L) - 8;
  const rValMaxW = R - rValX - PAD_X;
  const fullValMaxW = R - lValX - PAD_X;

  const drawValFit = (str, x, yy, maxW) => {
    const s2 = String(str || '—');
    let sz = valSize;
    while (sz > 6.5 && bold.widthOfTextAtSize(s2, sz) > maxW) sz -= 0.5;
    page.drawText(s2, { x, y: yy, size: sz, font: bold, color: INK });
  };
  const drawKV = (labelX, colonX, valX, valW, label, value, yy) => {
    page.drawText(label, { x: labelX, y: yy, size: lblSize, font, color: MUTED });
    page.drawText(':',   { x: colonX, y: yy, size: lblSize, font, color: MUTED });
    drawValFit(value, valX, yy, valW);
  };

  let pry = pbTop - pbPadV - ROW_H + 5;
  drawKV(lLabelX, lColonX, lValX, fullValMaxW, 'Name', bill.patientName, pry);
  pry -= ROW_H;

  // Vertical separator for the 2-column rows only
  page.drawLine({
    start: { x: L + halfW, y: pbBottom + 5 },
    end:   { x: L + halfW, y: pbTop - ROW_H - 5 },
    thickness: 0.5, color: BORDER,
  });

  const remainingRows = [
    [['Case No.',   bill.caseNumber],
     ['Mobile',     bill.mobile]],
    [['Gender/Age', `${bill.gender || '—'} / ${bill.age ?? '—'} Yrs`],
     ['UHID',       bill.patientCode]],
    [['Consultant', s.doctor_name],
     ['Visit',      `${bill.visitDate ? new Date(bill.visitDate).toLocaleDateString('en-IN') : '—'}  ${timeStr || bill.visitTime || ''}`.trim()]],
  ];
  for (const [[lLab, lVal], [rLab, rVal]] of remainingRows) {
    drawKV(lLabelX, lColonX, lValX, lValMaxW, lLab, lVal, pry);
    drawKV(rLabelX, rColonX, rValX, rValMaxW, rLab, rVal, pry);
    pry -= ROW_H;
  }

  y = pbBottom - 14;

  /* ============ SERVICES TABLE ============ */
  const tL = L, tR = R, tW = contentW;
  const AMT_COL_W = 96;
  const amtX = tR - AMT_COL_W;
  const T_PAD_X = 12;

  // Header
  const tHeadH = 22;
  page.drawRectangle({
    x: tL, y: y - tHeadH, width: tW, height: tHeadH,
    color: SOFT_GREEN,
    borderColor: BORDER, borderWidth: 0.8,
  });
  page.drawLine({
    start: { x: amtX, y }, end: { x: amtX, y: y - tHeadH },
    thickness: 0.6, color: BORDER,
  });
  page.drawText('Particulars', {
    x: tL + T_PAD_X, y: y - 15, size: 10.5, font: bold, color: INK,
  });
  const amtH = 'Amount';
  const ahw = bold.widthOfTextAtSize(amtH, 10.5);
  page.drawText(amtH, {
    x: tR - T_PAD_X - ahw, y: y - 15, size: 10.5, font: bold, color: INK,
  });
  y -= tHeadH;

  // Body
  const tBodyTop = y;
  const lineH = 19;
  const minBodyRows = 4;
  let drawn = 0;

  bill.services.forEach((line) => {
    const name = (line.serviceName || '').toUpperCase();
    const lines = wrap(name, font, 10, amtX - tL - 2 * T_PAD_X);
    lines.forEach((ln, idx) => {
      const yy = tBodyTop - drawn * lineH - lineH + 6;
      page.drawText(ln, { x: tL + T_PAD_X, y: yy, size: 10, font, color: INK });
      if (idx === 0) {
        const amt = money(line.total ?? line.unitPrice * line.quantity);
        const aw2 = font.widthOfTextAtSize(amt, 10);
        page.drawText(amt, { x: tR - T_PAD_X - aw2, y: yy, size: 10, font, color: INK });
      }
      drawn += 1;
    });
  });
  if (bill.services.length === 0) {
    const yy = tBodyTop - drawn * lineH - lineH + 6;
    page.drawText('No services.',
      { x: tL + T_PAD_X, y: yy, size: 10, font, color: MUTED });
    drawn += 1;
  }
  const padRows = Math.max(0, minBodyRows - drawn);
  drawn += padRows;
  const bodyH = drawn * lineH;
  const tBodyBottom = tBodyTop - bodyH;

  page.drawRectangle({
    x: tL, y: tBodyBottom, width: tW, height: bodyH,
    borderColor: BORDER, borderWidth: 0.8,
  });
  page.drawLine({
    start: { x: amtX, y: tBodyTop }, end: { x: amtX, y: tBodyBottom },
    thickness: 0.6, color: BORDER,
  });

  y = tBodyBottom;

  // Net Amount row
  const netH = 26;
  page.drawRectangle({
    x: tL, y: y - netH, width: tW, height: netH,
    color: SOFT_GREEN,
    borderColor: BORDER, borderWidth: 0.8,
  });
  page.drawLine({
    start: { x: amtX, y }, end: { x: amtX, y: y - netH },
    thickness: 0.6, color: BORDER,
  });
  const netLbl = 'Net Amount';
  const nlw = bold.widthOfTextAtSize(netLbl, 11);
  page.drawText(netLbl, {
    x: amtX - T_PAD_X - nlw, y: y - 17, size: 11, font: bold, color: INK,
  });
  const netStr = money(bill.total);
  const nsw = bold.widthOfTextAtSize(netStr, 12);
  page.drawText(netStr, {
    x: tR - T_PAD_X - nsw, y: y - 17, size: 12, font: bold, color: PRIMARY,
  });
  y -= netH + 14;

  /* ============ AMOUNT IN WORDS + SIGN-OFF (side by side) ============ */
  const words = amountInWords(bill.total || 0);
  const wordsMaxW = contentW * 0.6;
  const wLines = wrap(words, bold, 10, wordsMaxW);

  page.drawText('Amount in Words', { x: L, y, size: 9, font, color: MUTED });
  let wy = y - 13;
  wLines.forEach((ln) => {
    page.drawText(ln, { x: L, y: wy, size: 10, font: bold, color: INK });
    wy -= 12;
  });

  // "For, FEFSA HOSPITAL" sign-off, right side, aligned with Amount in Words.
  const signText = `For, ${(s.clinic_name || 'HOSPITAL').toUpperCase()}`;
  const sw = bold.widthOfTextAtSize(signText, 10);
  const signY = y - 26;
  page.drawText(signText, {
    x: R - sw, y: signY, size: 10, font: bold, color: INK,
  });
  page.drawLine({
    start: { x: R - sw - 6, y: signY - 4 },
    end:   { x: R,          y: signY - 4 },
    thickness: 0.4, color: BORDER,
  });

  /* ============ FOOTER (centred, grey) ============ */
  const f1 = s.receipt_footer || 'Thank You for Visiting';
  const f2 = 'Get Well Soon';
  const f1w = font.widthOfTextAtSize(f1, 9);
  const f2w = oblique.widthOfTextAtSize(f2, 8);

  page.drawLine({
    start: { x: L, y: B + 28 }, end: { x: R, y: B + 28 },
    thickness: 0.5, color: BORDER,
  });
  page.drawText(f1, {
    x: L + (contentW - f1w) / 2, y: B + 17,
    size: 9, font, color: MUTED,
  });
  page.drawText(f2, {
    x: L + (contentW - f2w) / 2, y: B + 5,
    size: 8, font: oblique, color: MUTED,
  });

  return pdf.save();
};

module.exports = { buildBillPdf };
