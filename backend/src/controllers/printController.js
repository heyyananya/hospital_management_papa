const path = require('path');
const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const printService = require('../services/printService');
const receiptService = require('../services/receiptService');
const billingService = require('../services/billingService');
const audit = require('../middlewares/audit');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');

const billsService = require('../services/billsService');

/**
 * Print any bill (Auto or Final) by id. Renders the professional A4 PDF.
 * Updates printed_at as a soft signal that this bill has gone out.
 */
exports.printBill = asyncHandler(async (req, res) => {
  const bytes = await receiptService.buildBillPdf(req.params.id);
  await billsService.markPrinted(req.params.id);
  audit({
    userId: req.user.id, action: 'PRINT_BILL', entity: 'bills',
    entityId: req.params.id, ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="bill-${req.params.id}.pdf"`
  );
  res.send(Buffer.from(bytes));
});

/**
 * Consultation bill — single line for the NEW_CASE / OLD_CASE charge.
 * Accepts an optional ?amount=NNN query param to override the printed price.
 * After successful render, the stored visit charge is reset back to the
 * current master default price (per the clinic's "auto-reset" workflow).
 */
// Legacy endpoints retained for backward compat - they now redirect to
// the new Auto bill print so old links / bookmarks still work.
exports.consultationReceipt = asyncHandler(async (req, res) => {
  const bill = await billsService.getByVisitAndType(req.params.visitId, 'AUTO');
  if (!bill) throw new HttpError(404, 'No bill for this visit');
  req.params.id = bill.id;
  return exports.printBill(req, res);
});

exports.chargesReceipt = exports.consultationReceipt;

exports.prescription = asyncHandler(async (req, res) => {
  const bytes = await printService.buildPrescriptionPdf(req.params.visitId);
  audit({
    userId: req.user.id, action: 'PRINT_PRESCRIPTION', entity: 'patient_visits',
    entityId: req.params.visitId, ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="prescription-${req.params.visitId}.pdf"`
  );
  res.send(Buffer.from(bytes));
});

/**
 * Admin uploads / replaces the clinic Letterpad asset.
 * Accepts PDF, JPG, or PNG. The mime type decides the destination filename
 * so the print service can pick whichever format is present.
 */
exports.uploadLetterpad = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const ext = ({
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
  })[req.file.mimetype];
  if (!ext) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(400, 'Letterpad must be PDF, JPG, or PNG');
  }
  const baseAbs = path.resolve(env.PRINT.letterpadPath);
  const dir = path.dirname(baseAbs);
  fs.mkdirSync(dir, { recursive: true });
  // Clear any prior letterpad in another format so resolution stays predictable
  for (const stale of ['letterpad.pdf', 'letterpad.jpg', 'letterpad.jpeg', 'letterpad.png']) {
    const p = path.join(dir, stale);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const dest = path.join(dir, `letterpad${ext}`);
  fs.renameSync(req.file.path, dest);
  audit({
    userId: req.user.id, action: 'UPLOAD_LETTERPAD', entity: 'settings',
    ip: req.ip,
  });
  res.json({ ok: true, kind: ext.slice(1) });
});
