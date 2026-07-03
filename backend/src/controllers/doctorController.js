const asyncHandler = require('../utils/asyncHandler');
const doctorService = require('../services/doctorService');
const audit = require('../middlewares/audit');

exports.queue = asyncHandler(async (_req, res) => {
  const rows = await doctorService.myQueue();
  res.json(rows);
});

exports.save = asyncHandler(async (req, res) => {
  await doctorService.saveDoctorRecord(req.params.id, req.body, req.user);
  audit({
    userId: req.user.id, action: 'SAVE_DOCTOR', entity: 'doctor_records',
    entityId: req.params.id, ip: req.ip,
  });
  res.json({ ok: true });
});
