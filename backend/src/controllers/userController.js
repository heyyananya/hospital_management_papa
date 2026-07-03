const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');
const audit = require('../middlewares/audit');

exports.list = asyncHandler(async (_req, res) => {
  const users = await userService.list();
  res.json(users);
});

exports.create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body);
  audit({ userId: req.user.id, action: 'CREATE', entity: 'users', entityId: user.id, ip: req.ip });
  res.status(201).json(user);
});

exports.update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  audit({ userId: req.user.id, action: 'UPDATE', entity: 'users', entityId: user.id, ip: req.ip });
  res.json(user);
});

exports.remove = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  audit({ userId: req.user.id, action: 'DEACTIVATE', entity: 'users', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});
