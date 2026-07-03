const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');
const audit = require('../middlewares/audit');

exports.upload = asyncHandler(async (req, res) => {
  const report = await reportService.create({
    patientId: req.body.patientId || req.params.patientId,
    visitId: req.body.visitId || null,
    file: req.file,
    user: req.user,
  });
  audit({
    userId: req.user.id, action: 'UPLOAD', entity: 'reports',
    entityId: report.id, ip: req.ip,
  });
  res.status(201).json(report);
});

exports.listForPatient = asyncHandler(async (req, res) => {
  const rows = await reportService.listForPatient(req.params.patientId);
  res.json(rows);
});

exports.remove = asyncHandler(async (req, res) => {
  await reportService.remove(req.params.id);
  audit({
    userId: req.user.id, action: 'DELETE', entity: 'reports',
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});
