const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const audit = require('../middlewares/audit');

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  const result = await authService.login({ username, password });
  audit({ userId: result.user.id, action: 'LOGIN', entity: 'users', entityId: result.user.id, ip: req.ip });
  return res.json(result);
});

exports.me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user.id);
  return res.json(user);
});

exports.logout = asyncHandler(async (req, res) => {
  // Stateless JWT - we just audit the event and let the client drop the token.
  audit({ userId: req.user.id, action: 'LOGOUT', entity: 'users', entityId: req.user.id, ip: req.ip });
  return res.json({ ok: true });
});
