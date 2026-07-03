const asyncHandler = require('../utils/asyncHandler');
const moService = require('../services/moService');
const audit = require('../middlewares/audit');

exports.queue = asyncHandler(async (_req, res) => {
  const rows = await moService.myQueue();
  res.json(rows);
});

exports.save = asyncHandler(async (req, res) => {
  await moService.saveMORecord(req.params.id, req.body, req.user);
  audit({
    userId: req.user.id, action: 'SAVE_MO', entity: 'medical_officer_records',
    entityId: req.params.id, ip: req.ip,
  });
  res.json({ ok: true });
});

exports.stats = asyncHandler(async (req, res) => {
  // A Medical Officer only ever sees their own count; ignore any moId they
  // pass and force it to their own user id. Admins may filter freely.
  const moId = req.user.role === 'MEDICAL_OFFICER'
    ? req.user.id
    : (req.query.moId || null);
  const data = await moService.attendedStats({
    fromDate: req.query.fromDate || null,
    toDate:   req.query.toDate   || null,
    moId,
  });
  res.json(data);
});
