/**
 * Tiny reusable validators. We keep validation hand-rolled and explicit
 * so we don't pull in a heavier dep just for a clinic-scale app.
 */
const HttpError = require('./HttpError');

const required = (obj, fields) => {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) {
    throw new HttpError(400, `Missing required field(s): ${missing.join(', ')}`);
  }
};

const isMobile = (v) => /^[6-9]\d{9}$/.test(String(v || '').trim());

const ensureMobile = (v) => {
  if (!isMobile(v)) throw new HttpError(400, 'Invalid mobile number');
};

const ensureEnum = (v, allowed, name = 'value') => {
  if (!allowed.includes(v)) {
    throw new HttpError(400, `Invalid ${name}. Expected one of: ${allowed.join(', ')}`);
  }
};

module.exports = { required, isMobile, ensureMobile, ensureEnum };
