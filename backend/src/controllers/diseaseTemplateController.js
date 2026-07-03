const asyncHandler = require('../utils/asyncHandler');
const svc = require('../services/diseaseTemplateService');
const audit = require('../middlewares/audit');

exports.listDiseases = asyncHandler(async (_req, res) => {
  res.json(await svc.listDiseasesWithCounts());
});

exports.getTemplates = asyncHandler(async (req, res) => {
  res.json(await svc.getTemplatesForDisease(req.params.diseaseId));
});

exports.replaceTemplates = asyncHandler(async (req, res) => {
  const rows = await svc.replaceTemplates(req.params.diseaseId, req.body.items || []);
  audit({
    userId: req.user.id, action: 'REPLACE', entity: 'disease_medicine_templates',
    entityId: req.params.diseaseId, ip: req.ip,
  });
  res.json(rows);
});
