/**
 * Wrap async route handlers so thrown errors propagate to the
 * centralised error middleware without writing try/catch in every handler.
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
