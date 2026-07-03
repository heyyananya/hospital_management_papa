const asyncHandler = require('../utils/asyncHandler');
const registerService = require('../services/registerService');
const audit = require('../middlewares/audit');
const HttpError = require('../utils/HttpError');

const parseDates = (q) => {
  const fromDate = q.fromDate;
  const toDate   = q.toDate;
  if (!fromDate || !toDate) {
    throw new HttpError(400, 'fromDate and toDate are required (YYYY-MM-DD)');
  }
  return { fromDate, toDate };
};

const pickMode = (q) => (q.mode === 'detail' ? 'detail' : 'day');

exports.threeCRegister = asyncHandler(async (req, res) => {
  const dates = parseDates(req.query);
  const mode = pickMode(req.query);
  const result = mode === 'detail'
    ? await registerService.threeCRegisterDetail(dates)
    : await registerService.threeCRegister(dates);
  res.json({ mode, ...result });
});

exports.setThreeCAmount = asyncHandler(async (req, res) => {
  const { date, amount } = req.body || {};
  if (!date) throw new HttpError(400, 'date is required (YYYY-MM-DD)');
  const clearing = amount === null || amount === undefined || amount === '';
  if (!clearing) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      throw new HttpError(400, 'amount must be a non-negative number');
    }
  }
  const result = await registerService.setThreeCAmount({
    date,
    amount: clearing ? null : amount,
    userId: req.user?.id,
  });
  audit({
    userId: req.user.id,
    action: clearing ? 'CLEAR_3C_AMOUNT_OVERRIDE' : 'SET_3C_AMOUNT_OVERRIDE',
    entity: 'three_c_amount_overrides',
    ip: req.ip,
    meta: { date, amount: clearing ? null : Number(amount) },
  });
  res.json(result);
});

exports.threeCRegisterPdf = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = parseDates(req.query);
  const mode = pickMode(req.query);
  const bytes = mode === 'detail'
    ? await registerService.threeCRegisterDetailPdf({ fromDate, toDate })
    : await registerService.threeCRegisterPdf({ fromDate, toDate });
  audit({
    userId: req.user.id, action: 'PRINT_3C_REGISTER', entity: 'bills',
    ip: req.ip, meta: { fromDate, toDate, mode },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="3c-register-${mode}-${fromDate}-to-${toDate}.pdf"`
  );
  res.send(Buffer.from(bytes));
});

/* ---------------- 3C Register IPD ---------------- */

exports.listThreeCIpd = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query || {};
  const result = await registerService.listThreeCIpd({
    fromDate: fromDate || null,
    toDate:   toDate   || null,
  });
  res.json(result);
});

exports.createThreeCIpd = asyncHandler(async (req, res) => {
  const {
    admissionId, patientName, age, village, diagnosis, doa, dod, amount,
  } = req.body || {};
  const entry = await registerService.createThreeCIpd({
    admissionId, patientName, age, village, diagnosis, doa, dod, amount,
    userId: req.user?.id,
  });
  audit({
    userId: req.user.id, action: 'CREATE_3C_IPD_ENTRY',
    entity: 'three_c_ipd_entries', entityId: entry.id, ip: req.ip,
    meta: { regSeq: entry.regSeq, receiptNumber: entry.receiptNumber },
  });
  res.status(201).json(entry);
});

exports.updateThreeCIpd = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new HttpError(400, 'invalid id');
  const entry = await registerService.updateThreeCIpd(id, req.body || {});
  audit({
    userId: req.user.id, action: 'UPDATE_3C_IPD_ENTRY',
    entity: 'three_c_ipd_entries', entityId: id, ip: req.ip,
    meta: { patch: Object.keys(req.body || {}) },
  });
  res.json(entry);
});

exports.removeThreeCIpd = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new HttpError(400, 'invalid id');
  await registerService.removeThreeCIpd(id);
  audit({
    userId: req.user.id, action: 'DELETE_3C_IPD_ENTRY',
    entity: 'three_c_ipd_entries', entityId: id, ip: req.ip,
  });
  res.status(204).end();
});

exports.threeCIpdPdf = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query || {};
  const bytes = await registerService.threeCIpdPdf({
    fromDate: fromDate || null,
    toDate:   toDate   || null,
  });
  audit({
    userId: req.user.id, action: 'PRINT_3C_IPD_REGISTER',
    entity: 'three_c_ipd_entries', ip: req.ip,
    meta: { fromDate: fromDate || null, toDate: toDate || null },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="3c-register-ipd-${fromDate || 'all'}-to-${toDate || 'all'}.pdf"`
  );
  res.send(Buffer.from(bytes));
});
