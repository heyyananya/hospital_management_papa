const path = require('path');
const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const settingsService = require('../services/settingsService');
const audit = require('../middlewares/audit');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');

exports.get = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getAll();
  res.json(settings);
});

exports.update = asyncHandler(async (req, res) => {
  const out = await settingsService.updateMany(req.body || {}, req.user);
  audit({
    userId: req.user.id, action: 'UPDATE_SETTINGS', entity: 'app_settings',
    ip: req.ip,
  });
  res.json(out);
});

const LOGO_DIR  = path.resolve(env.UPLOAD_DIR, 'branding');
const LOGO_PATH = path.join(LOGO_DIR, 'logo.png');

exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  if (!['image/png', 'image/jpeg'].includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(400, 'Logo must be a PNG or JPEG');
  }
  if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
  fs.renameSync(req.file.path, LOGO_PATH);
  audit({
    userId: req.user.id, action: 'UPLOAD_LOGO', entity: 'settings', ip: req.ip,
  });
  res.json({ ok: true });
});

// Serve the logo (small, browser-friendly).
exports.getLogo = asyncHandler(async (_req, res) => {
  if (!fs.existsSync(LOGO_PATH)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(LOGO_PATH).pipe(res);
});

exports.LOGO_PATH = LOGO_PATH;
