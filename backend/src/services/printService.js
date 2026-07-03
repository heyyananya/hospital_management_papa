/**
 * Prescription printing service.
 *
 * Letterpad source resolution (first match wins):
 *   1. PDF at env.PRINT.letterpadPath               -> use as page template
 *   2. JPG/PNG sibling (letterpad.jpg/.jpeg/.png)   -> draw as page background
 *   3. None                                          -> render on blank A4
 *
 * Layout (matches the clinic-provided spec):
 *   ──────────────────────────────────────────────────────────
 *   Patient ID : 12345                       Date : 28-06-26
 *   Name : XYZ                               Age : 32/M
 *   K/C/O : DM, HT, IHD …                    Weight :
 *
 *   Complaints :
 *     Cough (dry), 15 days
 *     Cough (productive) 30 days
 *     …
 *
 *   Vitals :
 *     Pulse : 72/min , BP : 120/80 mm Hg. SpO2 : 98 %
 *
 *   Examination :
 *     BLAE present, Reduced AE Left …
 *
 *   Investigation :
 *     CBC, Chest X-Ray PA view …
 *
 *   Treatment :
 *
 *     Tab Follo up (200 mg) 1-0-1              (10 Tab)
 *
 *     Tab Nilcoryl 1-0-1                       (10 Tab)
 *     …
 *
 *   Advice
 *     • Drink plenty of warm water
 *     …
 *
 *   Plan
 *     <free text plan>
 *
 *   Follow up visit on : 07-07-26
 *                                              Dr Ajit Patel
 *                                              Fefsa Hospital
 *                                              Palanpur
 */
// regenerator-runtime polyfill required by @pdf-lib/fontkit UMD bundle.
// Must come BEFORE fontkit is required.
require('regenerator-runtime/runtime');

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const env = require('../config/env');
const visitService = require('./visitService');

const A4 = { width: 595.28, height: 841.89 };

const FONT_DIR = path.resolve(__dirname, '../assets/fonts');
const FONT_DEVANAGARI = path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf');
const FONT_GUJARATI   = path.join(FONT_DIR, 'NotoSansGujarati-Regular.ttf');

// Intake values stored in DB are English. Map them to Hindi (Devanagari) and
// Gujarati so the printed prescription speaks the patient's language.
// Keys are lowercased + trimmed for case-insensitive lookup.
const INTAKE_TRANSLATIONS = {
  hi: {
    'before food':      'खाने से पहले',
    'after food':       'खाने के बाद',
    'before breakfast': 'नाश्ते से पहले',
    'before lunch':     'दोपहर के खाने से पहले',
    'after lunch':      'दोपहर के खाने के बाद',
    'before dinner':    'रात के खाने से पहले',
    'after dinner':     'रात के खाने के बाद',
    'with food':        'खाने के साथ',
    'empty stomach':    'खाली पेट',
  },
  gu: {
    'before food':      'જમ્યા પહેલા',
    'after food':       'જમ્યા પછી',
    'before breakfast': 'નાસ્તા પહેલા',
    'before lunch':     'બપોરના જમ્યા પહેલા',
    'after lunch':      'બપોરના જમ્યા પછી',
    'before dinner':    'રાત્રીના જમ્યા પહેલા',
    'after dinner':     'રાત્રીના જમ્યા પછી',
    'with food':        'જમ્યા સાથે',
    'empty stomach':    'ખાલી પેટ',
  },
};

const pickLanguage = (state) => {
  const s = (state || '').trim().toLowerCase();
  if (s === 'gujarat') return 'gu';
  return 'hi'; // Rajasthan + anything else
};

const translateIntake = (value, lang) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return INTAKE_TRANSLATIONS[lang]?.[key] || value;
};

const wrapText = (text, font, fontSize, maxWidth) => {
  const out = [];
  const paragraphs = String(text || '').split(/\r?\n/);
  for (const para of paragraphs) {
    if (para.trim() === '') { out.push(''); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (line) out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
};

const resolveLetterpad = () => {
  const pdf = path.resolve(env.PRINT.letterpadPath);
  if (fs.existsSync(pdf)) return { kind: 'pdf', abs: pdf };
  const dir = path.dirname(pdf);
  for (const name of ['letterpad.jpg', 'letterpad.jpeg', 'letterpad.png']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      return { kind: name.endsWith('.png') ? 'png' : 'jpg', abs: p };
    }
  }
  return null;
};

const ageString = (visit) => {
  const g = (visit.gender || '').toString().trim();
  const gShort = g ? g[0].toUpperCase() : '';
  const age = visit.age || visit.ageYears || '';
  return age ? `${age}/${gShort}` : gShort;
};

const unitFor = (medName) => {
  const n = (medName || '').toLowerCase();
  if (/\b(syp|syrup|susp|suspension|liquid)\b/.test(n)) return 'Bottle';
  if (/\b(cap|capsule)\b/.test(n))                       return 'Cap';
  if (/\b(inj|injection|amp|ampoule|vial)\b/.test(n))    return 'Inj';
  if (/\b(inhaler|puffs?)\b/.test(n))                    return 'Inhaler';
  if (/\b(drop|drops)\b/.test(n))                        return 'Drops';
  if (/\b(oint|ointment|cream|gel|lotion)\b/.test(n))    return 'Tube';
  return 'Tab';
};

const buildPrescriptionPdf = async (visitId) => {
  const visit = await visitService.getVisitFull(visitId);

  // Output is a blank A4 — the clinic prints onto pre-printed Fefsa
  // letterhead paper, so we must leave the header/footer band white and
  // only render content inside the empty middle window (margins below).
  let pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([A4.width, A4.height]);
  const bgImage = null; // reserved for future digital-letterpad mode

  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Lazy-load script fonts only if we need them for this visit's language.
  pdfDoc.registerFontkit(fontkit);
  const lang = pickLanguage(visit.state);
  let intakeFont = font;
  const ttfPath = lang === 'gu' ? FONT_GUJARATI : FONT_DEVANAGARI;
  if (fs.existsSync(ttfPath)) {
    const ttfBytes = await fs.promises.readFile(ttfPath);
    intakeFont = await pdfDoc.embedFont(ttfBytes, { subset: true });
  }

  const m = env.PRINT;
  const left = m.marginLeft;
  const right = m.marginRight;
  const top = m.marginTop;
  const bottom = m.marginBottom;
  const contentWidth = width - left - right;
  let y = height - top;

  const ink = rgb(0.08, 0.08, 0.08);
  const SIZE = 11;
  const LINE = 15;
  const SECTION_GAP = 8;

  const draw = (str, opts = {}) => {
    const { size = SIZE, bold = false, x, indent = 0, color = ink } = opts;
    page.drawText(String(str ?? ''), {
      x: x != null ? x : left + indent,
      y, size, font: bold ? fontBold : font, color,
    });
  };

  const drawRight = (str, opts = {}) => {
    const { size = SIZE, bold = false, color = ink } = opts;
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(String(str ?? ''), size);
    page.drawText(String(str ?? ''), {
      x: left + contentWidth - w, y, size, font: f, color,
    });
  };

  const newline = (delta = LINE) => { y -= delta; };

  const newPage = () => {
    const np = pdfDoc.addPage([A4.width, A4.height]);
    if (bgImage) {
      np.drawImage(bgImage, { x: 0, y: 0, width: A4.width, height: A4.height });
    }
    page = np;
    y = A4.height - top;
  };

  const ensure = (need) => {
    if (y - need < bottom) newPage();
  };

  // Draw a label + a free-flowing value; the value wraps. The label sits
  // bold on its own line; the value starts on the next line, indented.
  const labelBlock = (labelText, valueText, opts = {}) => {
    const { valueIndent = 0, gap = SECTION_GAP } = opts;
    ensure(LINE * 2);
    draw(labelText, { bold: true });
    newline();
    if (valueText) {
      const lines = wrapText(valueText, font, SIZE, contentWidth - valueIndent);
      for (const ln of lines) {
        ensure(LINE);
        draw(ln, { indent: valueIndent });
        newline();
      }
    }
    newline(gap);
  };

  // ── Patient ID / Date ───────────────────────────────────────
  const visitDate = new Date(visit.visitDate).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
  draw(`Patient ID : ${visit.patientCode || ''}`);
  drawRight(`Date : ${visitDate}`);
  newline(18);

  // ── Name / Age ──────────────────────────────────────────────
  const fullName = [visit.firstName, visit.middleName, visit.surname]
    .filter(Boolean).join(' ');
  draw(`Name : ${fullName}`);
  const ageStr = ageString(visit);
  if (ageStr) drawRight(`Age : ${ageStr}`);
  newline(18);

  // ── Rule below patient details ──────────────────────────────
  newline(4);
  page.drawLine({
    start: { x: left, y: y + 4 },
    end:   { x: left + contentWidth, y: y + 4 },
    thickness: 0.6, color: rgb(0.25, 0.25, 0.25),
  });
  newline(SECTION_GAP + 2);

  // ── K/C/O + Complaints (left)   |   Weight + Vitals (right) ─
  // K/C/O prints the short code (e.g. HTN, DM, COPD) — falls back to the
  // full name only if a master row lacks a code, and to custom_name for
  // ad-hoc entries the doctor typed in.
  const kd = (visit.knownDiseases || [])
    .map((d) => d.code || d.name || d.customName).filter(Boolean);
  const mo = visit.medicalOfficer || {};
  const wt = mo.weight;

  // Right column: Weight on top, vitals stacked beneath in column format.
  const rightItems = [];
  rightItems.push(['Weight', wt ? `${wt} kg` : '']);
  if (mo.pulse) rightItems.push(['Pulse', `${mo.pulse}/min`]);
  if (mo.bpSystolic || mo.bpDiastolic)
    rightItems.push(['BP', `${mo.bpSystolic || '-'}/${mo.bpDiastolic || '-'} mm Hg.`]);
  if (mo.spo2) rightItems.push(['SpO2', `${mo.spo2} %`]);

  const rightColX = left + Math.round(contentWidth * 0.70);
  const rightLabelWMax = Math.max(
    ...rightItems.map(([lbl]) => fontBold.widthOfTextAtSize(`${lbl} : `, SIZE))
  );

  const leftColW = rightColX - left - 10;

  // Gather complaints (structured + free-text)
  const complaintLines = [];
  for (const c of (visit.complaints || [])) {
    const name = c.name || c.customName;
    if (!name) continue;
    complaintLines.push(c.duration ? `${name}, ${c.duration}` : name);
  }
  const moTxt = (mo.complaints || '').trim();
  if (moTxt) {
    for (const ln of moTxt.split(/\r?\n/)) {
      const t = ln.trim();
      if (t) complaintLines.push(t);
    }
  }

  const rowYStart = y;
  let leftY = rowYStart;
  let rightY = rowYStart;

  // LEFT — K/C/O label + wrapped value
  const kcoLabel = 'K/C/O : ';
  const kcoLabelW = fontBold.widthOfTextAtSize(kcoLabel, SIZE);
  const kcoLines = wrapText(kd.join(', '), font, SIZE, leftColW - kcoLabelW);
  page.drawText(kcoLabel, { x: left, y: leftY, size: SIZE, font: fontBold, color: ink });
  if (kcoLines[0]) {
    page.drawText(kcoLines[0], { x: left + kcoLabelW, y: leftY, size: SIZE, font, color: ink });
  }
  for (let i = 1; i < kcoLines.length; i++) {
    leftY -= LINE;
    page.drawText(kcoLines[i], { x: left + kcoLabelW, y: leftY, size: SIZE, font, color: ink });
  }

  // LEFT — Complaints, immediately under K/C/O
  leftY -= LINE + 2;
  page.drawText('Complaints : ', { x: left, y: leftY, size: SIZE, font: fontBold, color: ink });
  for (const cl of complaintLines) {
    const wrapped = wrapText(cl, font, SIZE, leftColW);
    for (const w of wrapped) {
      leftY -= LINE;
      page.drawText(w, { x: left, y: leftY, size: SIZE, font, color: ink });
    }
  }

  // RIGHT — Weight + vitals stack
  for (const [lbl, val] of rightItems) {
    page.drawText(`${lbl} : `, {
      x: rightColX, y: rightY,
      size: SIZE, font: fontBold, color: ink,
    });
    if (val) {
      page.drawText(val, {
        x: rightColX + rightLabelWMax, y: rightY,
        size: SIZE, font, color: ink,
      });
    }
    rightY -= LINE;
  }

  // Advance the cursor below whichever column ran longer.
  y = Math.min(leftY, rightY) - 2;
  newline(SECTION_GAP);

  // ── Examination ─────────────────────────────────────────────
  const exam = (() => {
    try { return JSON.parse(visit.doctor?.examination || '[]'); }
    catch { return []; }
  })();
  labelBlock('Examination : ', exam.join(', '));

  // ── Investigation ───────────────────────────────────────────
  const inv = (() => {
    try { return JSON.parse(visit.doctor?.investigation || '[]'); }
    catch { return []; }
  })();
  labelBlock('Investigation : ', inv.join(', '));

  // ── Treatment (bordered table) ──────────────────────────────
  ensure(LINE * 2);
  draw('Treatment : ', { bold: true });
  newline(LINE + 2);

  const meds = visit.medicines || [];
  const freeRxLines = (visit.doctor?.prescription || '')
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  // Columns: NO | MEDICINE | DOSAGE | INTAKE | DAYS | QTY
  const colDefs = [
    { key: 'no',     w: 30,  label: 'NO.',      align: 'center' },
    { key: 'med',    w: 0,   label: 'MEDICINE', align: 'left'   }, // fills rest
    { key: 'dosage', w: 80,  label: 'DOSAGE',   align: 'center' },
    { key: 'intake', w: 95,  label: 'INTAKE',   align: 'center' },
    { key: 'days',   w: 45,  label: 'DAYS',     align: 'center' },
    { key: 'qty',    w: 45,  label: 'QTY',      align: 'center' },
  ];
  const fixedW = colDefs.reduce((s, c) => s + c.w, 0);
  // Medicine column takes whatever is left
  colDefs[1].w = Math.max(120, contentWidth - fixedW);

  const colX = [];
  { let acc = left; for (const c of colDefs) { colX.push(acc); acc += c.w; } }
  const tableRight = left + contentWidth;
  const ruleColor = rgb(0.3, 0.3, 0.3);

  const cellText = (txt, x, w, opts = {}) => {
    const { size = 10, bold = false, align = 'left', padX = 4, font: cellFont } = opts;
    const f = cellFont || (bold ? fontBold : font);
    const str = String(txt ?? '');
    if (!str) return;
    const tw = f.widthOfTextAtSize(str, size);
    let drawX = x + padX;
    if (align === 'center') drawX = x + (w - tw) / 2;
    if (align === 'right')  drawX = x + w - tw - padX;
    page.drawText(str, { x: drawX, y, size, font: f, color: ink });
  };

  const drawHRule = (yLine) => {
    page.drawLine({
      start: { x: left, y: yLine },
      end:   { x: tableRight, y: yLine },
      thickness: 0.6, color: ruleColor,
    });
  };
  const drawVRules = (yTop, yBottom) => {
    let x = left;
    for (let i = 0; i < colDefs.length; i++) {
      page.drawLine({
        start: { x, y: yTop }, end: { x, y: yBottom },
        thickness: 0.6, color: ruleColor,
      });
      x += colDefs[i].w;
    }
    page.drawLine({
      start: { x: tableRight, y: yTop }, end: { x: tableRight, y: yBottom },
      thickness: 0.6, color: ruleColor,
    });
  };

  const ROW_PAD = 4;
  const CELL_LH = 11;

  const drawHeaderRow = () => {
    const headerH = 16;
    const yTop = y + ROW_PAD;
    const yBottom = y - headerH + ROW_PAD;
    page.drawRectangle({
      x: left, y: yBottom, width: contentWidth, height: yTop - yBottom,
      color: rgb(0.93, 0.95, 0.98),
    });
    drawHRule(yTop);
    drawHRule(yBottom);
    drawVRules(yTop, yBottom);
    y -= 4;
    colDefs.forEach((c, i) => {
      cellText(c.label, colX[i], c.w, { size: 9, bold: true, align: 'center' });
    });
    y = yBottom - 2;
  };

  const drawMedRow = (row, idx) => {
    const medLines    = wrapText(row.medicineName || '', font, 10, colDefs[1].w - 8);
    const dosageLines = wrapText(row.dosage || '',       font, 10, colDefs[2].w - 4);
    const intakeStr   = translateIntake(row.intake, lang);
    const intakeLines = wrapText(intakeStr, intakeFont, 9, colDefs[3].w - 4);
    const usedLines = Math.max(1, medLines.length, dosageLines.length, intakeLines.length);
    const rowH = usedLines * CELL_LH + ROW_PAD * 2;
    ensure(rowH + 4);

    const yTop = y + ROW_PAD;
    const yBottom = y - rowH + ROW_PAD;
    drawVRules(yTop, yBottom);
    drawHRule(yBottom);

    y = yTop - CELL_LH;
    cellText(String(idx + 1),     colX[0], colDefs[0].w, { size: 10, align: 'center' });
    cellText(medLines[0]    || '', colX[1], colDefs[1].w, { size: 10, align: 'left'   });
    cellText(dosageLines[0] || '', colX[2], colDefs[2].w, { size: 10, align: 'center' });
    cellText(intakeLines[0] || '', colX[3], colDefs[3].w, { size: 9,  align: 'center', font: intakeFont });
    cellText(row.days != null ? String(row.days) : '', colX[4], colDefs[4].w, { size: 10, align: 'center' });
    cellText(row.qty  != null ? String(row.qty)  : '', colX[5], colDefs[5].w, { size: 10, align: 'center' });

    for (let i = 1; i < usedLines; i++) {
      y -= CELL_LH;
      if (medLines[i])    cellText(medLines[i],    colX[1], colDefs[1].w, { size: 10, align: 'left'   });
      if (dosageLines[i]) cellText(dosageLines[i], colX[2], colDefs[2].w, { size: 10, align: 'center' });
      if (intakeLines[i]) cellText(intakeLines[i], colX[3], colDefs[3].w, { size: 9,  align: 'center', font: intakeFont });
    }
    y = yBottom - 2;
  };

  const tableRows = [...meds];
  // Free-text Rx notes become bare rows (medicine column only)
  for (const ln of freeRxLines) {
    tableRows.push({
      medicineName: ln,
      dosage: '', intake: '', days: null, qty: null,
    });
  }

  if (tableRows.length) {
    drawHRule(y + ROW_PAD);
    drawHeaderRow();
    tableRows.forEach((r, i) => drawMedRow(r, i));
  } else {
    draw('—');
    newline();
  }
  newline(SECTION_GAP + 4);

  // ── Advice ──────────────────────────────────────────────────
  ensure(LINE * 2);
  draw('Advice', { bold: true });
  newline();
  const advices = (visit.advices || [])
    .map((a) => a.text || a.customText).filter(Boolean);
  for (const a of advices) {
    const wrapped = wrapText(`• ${a}`, font, SIZE, contentWidth - 14);
    wrapped.forEach((w, i) => {
      ensure(LINE);
      draw(w, { indent: i === 0 ? 0 : 12 });
      newline();
    });
  }
  newline(SECTION_GAP);

  // ── Plan ────────────────────────────────────────────────────
  ensure(LINE * 2);
  draw('Plan', { bold: true });
  newline();
  const rawPlan = (visit.doctor?.plan || '').trim();
  let planItems = [];
  if (rawPlan) {
    try {
      const parsed = JSON.parse(rawPlan);
      planItems = Array.isArray(parsed) ? parsed.filter(Boolean) : [rawPlan];
    } catch {
      // legacy free-text plan — split on newlines
      planItems = rawPlan.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
  }
  for (const item of planItems) {
    const wrapped = wrapText(`• ${item}`, font, SIZE, contentWidth - 14);
    wrapped.forEach((ln, i) => {
      ensure(LINE);
      draw(ln, { indent: i === 0 ? 0 : 12 });
      newline();
    });
  }
  newline(SECTION_GAP);

  // ── Follow up ───────────────────────────────────────────────
  let followText = '';
  if (visit.followup?.followupDate) {
    followText = new Date(visit.followup.followupDate)
      .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
    if (visit.followup.notes) followText += ` — ${visit.followup.notes}`;
  }
  ensure(LINE);
  draw(`Follow up visit on : ${followText}`, { bold: true });
  newline(36);

  // ── Signature block (bottom-right) ──────────────────────────
  const sigY = Math.max(bottom + 50, y);
  const sigText = 'Dr Ajit Patel';
  const sigW = fontBold.widthOfTextAtSize(sigText, SIZE);
  page.drawText(sigText, {
    x: left + contentWidth - sigW,
    y: sigY,
    size: SIZE,
    font: fontBold,
    color: ink,
  });

  return pdfDoc.save();
};

module.exports = { buildPrescriptionPdf, resolveLetterpad };
