/**
 * Multer setup for report uploads.
 * - PDF / JPG / JPEG / PNG only
 * - Configurable max size (default 10MB)
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');

const uploadRoot = path.resolve(env.UPLOAD_DIR, 'reports');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});

const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const fileFilter = (_req, file, cb) => {
  if (!allowed.has(file.mimetype)) {
    return cb(new HttpError(400, 'Only PDF, JPG, and PNG files are allowed'));
  }
  return cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
});
