const asyncHandler = require('../utils/asyncHandler');
const reminderService = require('../services/reminderService');
const audit = require('../middlewares/audit');

exports.list = asyncHandler(async (req, res) => {
  // Admin sees everything. Other roles only see reminders that target them —
  // so the bell + login popup for receptionist / medical officer are scoped
  // automatically by the API.
  const viewerRole = req.user.role === 'ADMIN' ? undefined : req.user.role;
  const rows = await reminderService.list({
    activeOnly: req.query.active === '1' || req.query.active === 'true',
    viewerRole,
  });
  res.json(rows);
});

exports.create = asyncHandler(async (req, res) => {
  const row = await reminderService.create(req.body, req.user);
  audit({
    userId: req.user.id, action: 'CREATE', entity: 'reminders',
    entityId: row.id, ip: req.ip,
  });
  res.status(201).json(row);
});

exports.update = asyncHandler(async (req, res) => {
  const row = await reminderService.update(req.params.id, req.body);
  audit({
    userId: req.user.id, action: 'UPDATE', entity: 'reminders',
    entityId: row.id, ip: req.ip,
  });
  res.json(row);
});

exports.remove = asyncHandler(async (req, res) => {
  await reminderService.remove(req.params.id);
  audit({
    userId: req.user.id, action: 'DELETE', entity: 'reminders',
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});

exports.complete = asyncHandler(async (req, res) => {
  const row = await reminderService.complete(req.params.id, req.user);
  audit({
    userId: req.user.id, action: 'COMPLETE', entity: 'reminders',
    entityId: row.id, ip: req.ip,
  });
  res.json(row);
});

exports.uncomplete = asyncHandler(async (req, res) => {
  const row = await reminderService.uncomplete(req.params.id);
  audit({
    userId: req.user.id, action: 'REOPEN', entity: 'reminders',
    entityId: row.id, ip: req.ip,
  });
  res.json(row);
});
