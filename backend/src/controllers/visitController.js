const asyncHandler = require('../utils/asyncHandler');
const visitService = require('../services/visitService');
const audit = require('../middlewares/audit');

exports.get = asyncHandler(async (req, res) => {
  const visit = await visitService.getVisitFull(req.params.id);
  res.json(visit);
});

exports.search = asyncHandler(async (req, res) => {
  const result = await visitService.search(req.query);
  res.json(result);
});

exports.cancel = asyncHandler(async (req, res) => {
  await visitService.cancel(req.params.id);
  audit({
    userId: req.user.id, action: 'CANCEL', entity: 'patient_visits',
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});
