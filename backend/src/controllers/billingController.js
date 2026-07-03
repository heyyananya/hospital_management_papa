const asyncHandler = require('../utils/asyncHandler');
const billingService = require('../services/billingService');
const audit = require('../middlewares/audit');

exports.list = asyncHandler(async (req, res) => {
  const result = await billingService.list(req.params.visitId);
  res.json(result);
});

exports.add = asyncHandler(async (req, res) => {
  const charge = await billingService.add(req.params.visitId, req.body, req.user);
  audit({
    userId: req.user.id, action: 'ADD_CHARGE', entity: 'visit_charges',
    entityId: charge.id, meta: { visitId: req.params.visitId }, ip: req.ip,
  });
  res.status(201).json(charge);
});

exports.remove = asyncHandler(async (req, res) => {
  await billingService.remove(req.params.id);
  audit({
    userId: req.user.id, action: 'DELETE_CHARGE', entity: 'visit_charges',
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});
