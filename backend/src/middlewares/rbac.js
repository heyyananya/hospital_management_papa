/**
 * Role-based access control. Accepts a list of allowed roles.
 * Usage: router.get('/x', auth, rbac('ADMIN', 'RECEPTIONIST'), handler)
 */
const HttpError = require('../utils/HttpError');

module.exports = (...allowed) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!allowed.includes(req.user.role)) {
    return next(new HttpError(403, 'You do not have permission to perform this action'));
  }
  return next();
};
