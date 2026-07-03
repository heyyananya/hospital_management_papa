const asyncHandler = require('../utils/asyncHandler');
const svc = require('../services/ipdService');
const audit = require('../middlewares/audit');

/* wards */
exports.listWards   = asyncHandler(async (req, res) => res.json(await svc.wards.list({
  activeOnly: req.query.activeOnly !== 'false',
})));
exports.createWard  = asyncHandler(async (req, res) => {
  const w = await svc.wards.create(req.body);
  audit({ userId: req.user.id, action: 'CREATE', entity: 'wards', entityId: w.id, ip: req.ip });
  res.status(201).json(w);
});
exports.updateWard  = asyncHandler(async (req, res) => res.json(await svc.wards.update(req.params.id, req.body)));
exports.removeWard  = asyncHandler(async (req, res) => { await svc.wards.remove(req.params.id); res.status(204).end(); });

/* beds */
exports.listBeds  = asyncHandler(async (req, res) => res.json(await svc.beds.list({
  wardId: req.query.wardId, freeOnly: req.query.freeOnly === '1' || req.query.freeOnly === 'true',
  activeOnly: req.query.activeOnly !== 'false',
})));
exports.createBed = asyncHandler(async (req, res) => {
  const b = await svc.beds.create(req.body);
  audit({ userId: req.user.id, action: 'CREATE', entity: 'beds', entityId: b.id, ip: req.ip });
  res.status(201).json(b);
});
exports.bulkCreateBeds = asyncHandler(async (req, res) => {
  const result = await svc.beds.bulkCreate(req.body);
  audit({ userId: req.user.id, action: 'BULK_CREATE', entity: 'beds',
          ip: req.ip, meta: { wardId: req.body.wardId, count: result.inserted.length } });
  res.status(201).json(result);
});
exports.updateBed = asyncHandler(async (req, res) => res.json(await svc.beds.update(req.params.id, req.body)));
exports.removeBed = asyncHandler(async (req, res) => { await svc.beds.remove(req.params.id); res.status(204).end(); });

/* admissions */
exports.listAdmissions = asyncHandler(async (req, res) => res.json(await svc.admissions.list({
  status: req.query.status, patientId: req.query.patientId ? Number(req.query.patientId) : undefined,
})));
exports.getAdmission   = asyncHandler(async (req, res) => res.json(await svc.admissions.getById(req.params.id)));
exports.requestAdmission = asyncHandler(async (req, res) => {
  const a = await svc.admissions.request(req.body, req.user);
  audit({ userId: req.user.id, action: 'REQUEST_ADMISSION', entity: 'admissions', entityId: a.id, ip: req.ip });
  res.status(201).json(a);
});
exports.assignBed = asyncHandler(async (req, res) => {
  const a = await svc.admissions.assignBed(req.params.id, req.body, req.user);
  audit({ userId: req.user.id, action: 'ASSIGN_BED', entity: 'admissions', entityId: a.id, ip: req.ip });
  res.json(a);
});
exports.discharge = asyncHandler(async (req, res) => {
  const a = await svc.admissions.discharge(req.params.id, req.body, req.user);
  audit({ userId: req.user.id, action: 'DISCHARGE', entity: 'admissions', entityId: a.id, ip: req.ip });
  res.json(a);
});
exports.cancel = asyncHandler(async (req, res) => {
  await svc.admissions.cancel(req.params.id);
  audit({ userId: req.user.id, action: 'CANCEL_ADMISSION', entity: 'admissions', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

/* indoor sheet */
exports.getIndoorSheet = asyncHandler(async (req, res) =>
  res.json(await svc.indoorSheet.get(req.params.id))
);
exports.saveIndoorSheet = asyncHandler(async (req, res) => {
  const result = await svc.indoorSheet.save(req.params.id, req.body?.days || [], req.user);
  audit({
    userId: req.user.id, action: 'SAVE_INDOOR_SHEET',
    entity: 'indoor_sheet_days', entityId: req.params.id, ip: req.ip,
    meta: { written: result.written },
  });
  res.json(result);
});
exports.deleteIndoorSheetDay = asyncHandler(async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ message: 'date query param required' });
  const result = await svc.indoorSheet.removeDay(req.params.id, date);
  audit({
    userId: req.user.id, action: 'DELETE_INDOOR_SHEET_DAY',
    entity: 'indoor_sheet_days', entityId: req.params.id, ip: req.ip,
    meta: { date, removed: result.removed },
  });
  res.json(result);
});

/* Admin dashboard — recent indoor sheet activity across all patients. */
exports.recentIndoorSheets = asyncHandler(async (req, res) => {
  const hoursWindow = Math.max(1, Math.min(24, Number(req.query.hours) || 6));
  const since = req.query.since || null;
  res.json(await svc.indoorSheet.recentActivity({ hoursWindow, since }));
});

/* Lightweight poll — how many admissions have edits since `since`? */
exports.recentIndoorSheetCount = asyncHandler(async (req, res) => {
  const hoursWindow = Math.max(1, Math.min(24, Number(req.query.hours) || 6));
  const since = req.query.since || null;
  const data = await svc.indoorSheet.recentActivity({ hoursWindow, since });
  res.json({
    count: data.admissions.length,
    lastUpdatedAt: data.admissions[0]?.lastUpdatedAt || null,
  });
});

exports.printIndoorSheet = asyncHandler(async (req, res) => {
  const svcPrint = require('../services/indoorSheetPdf');
  const bytes = await svcPrint.render(Number(req.params.id));
  audit({
    userId: req.user.id, action: 'PRINT_INDOOR_SHEET',
    entity: 'indoor_sheet_days', entityId: req.params.id, ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="indoor-sheet-${req.params.id}.pdf"`);
  res.send(Buffer.from(bytes));
});
