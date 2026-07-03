const asyncHandler = require('../utils/asyncHandler');
const billsService = require('../services/billsService');
const audit = require('../middlewares/audit');

exports.listAuto = asyncHandler(async (req, res) => {
  const out = await billsService.listBills({ ...req.query, billType: 'AUTO' });
  res.json(out);
});

exports.listFinal = asyncHandler(async (req, res) => {
  const out = await billsService.listBills({ ...req.query, billType: 'FINAL' });
  res.json(out);
});

exports.get = asyncHandler(async (req, res) => {
  const bill = await billsService.getBill(req.params.id);
  res.json(bill);
});

exports.convertToFinal = asyncHandler(async (req, res) => {
  const out = await billsService.convertToFinal(req.params.id, req.user);
  audit({
    userId: req.user.id, action: 'CREATE_FINAL_BILL', entity: 'bills',
    entityId: out.id, meta: { parent: req.params.id }, ip: req.ip,
  });
  res.status(201).json(out);
});

exports.updateFinal = asyncHandler(async (req, res) => {
  await billsService.updateFinal(req.params.id, req.body || {}, req.user);
  audit({
    userId: req.user.id, action: 'UPDATE_FINAL_BILL', entity: 'bills',
    entityId: req.params.id, ip: req.ip,
  });
  const bill = await billsService.getBill(req.params.id);
  res.json(bill);
});

exports.lockFinal = asyncHandler(async (req, res) => {
  await billsService.lockFinal(req.params.id);
  audit({
    userId: req.user.id, action: 'LOCK_FINAL_BILL', entity: 'bills',
    entityId: req.params.id, ip: req.ip,
  });
  const bill = await billsService.getBill(req.params.id);
  res.json(bill);
});
