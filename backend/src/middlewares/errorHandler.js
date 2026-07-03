/**
 * Centralised error handler. Converts internal errors into a single,
 * consistent JSON response shape so the frontend can rely on it.
 */
const HttpError = require('../utils/HttpError');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      message: err.message,
      details: err.details || undefined,
    });
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Duplicate value', detail: err.detail });
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);
  return res.status(500).json({ message: 'Internal server error' });
};
