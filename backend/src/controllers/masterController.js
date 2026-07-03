const asyncHandler = require('../utils/asyncHandler');
const masterService = require('../services/masterService');
const audit = require('../middlewares/audit');

exports.list = asyncHandler(async (req, res) => {
  const rows = await masterService.list(req.params.key, {
    q: req.query.q,
    activeOnly: req.query.activeOnly !== 'false',
  });
  res.json(rows);
});

exports.create = asyncHandler(async (req, res) => {
  const row = await masterService.create(req.params.key, req.body);
  audit({
    userId: req.user.id, action: 'CREATE', entity: req.params.key, entityId: row.id, ip: req.ip,
  });
  res.status(201).json(row);
});

exports.update = asyncHandler(async (req, res) => {
  const row = await masterService.update(req.params.key, req.params.id, req.body);
  audit({
    userId: req.user.id, action: 'UPDATE', entity: req.params.key, entityId: row.id, ip: req.ip,
  });
  res.json(row);
});

exports.remove = asyncHandler(async (req, res) => {
  await masterService.remove(req.params.key, req.params.id);
  audit({
    userId: req.user.id, action: 'DEACTIVATE', entity: req.params.key,
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});
