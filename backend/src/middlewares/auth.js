/**
 * JWT auth middleware. Populates `req.user = { id, username, role, fullName }`.
 */
const jwt = require('../utils/jwt');
const HttpError = require('../utils/HttpError');

module.exports = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token);
    req.user = payload;
    return next();
  } catch (_err) {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
};
