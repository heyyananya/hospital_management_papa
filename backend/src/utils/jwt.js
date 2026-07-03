/**
 * JWT helpers — signing and verification.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const sign = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const verify = (token) => jwt.verify(token, env.JWT_SECRET);

module.exports = { sign, verify };
