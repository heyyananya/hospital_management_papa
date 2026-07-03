const asyncHandler = require('../utils/asyncHandler');
const patientService = require('../services/patientService');
const audit = require('../middlewares/audit');

exports.search = asyncHandler(async (req, res) => {
  const results = await patientService.search(req.query);
  res.json(results);
});

exports.get = asyncHandler(async (req, res) => {
  const patient = await patientService.getById(req.params.id);
  res.json(patient);
});

exports.history = asyncHandler(async (req, res) => {
  const history = await patientService.history(req.params.id);
  res.json(history);
});

exports.createNew = asyncHandler(async (req, res) => {
  const result = await patientService.createNewPatientWithVisit(req.body, req.user);
  audit({
    userId: req.user.id, action: 'CREATE', entity: 'patients',
    entityId: result.patient.id, meta: { visitId: result.visit.id }, ip: req.ip,
  });
  res.status(201).json(result);
});

exports.createOldCase = asyncHandler(async (req, res) => {
  // `force` bypasses the "already-in-queue-today" guard. Only used when the
  // receptionist explicitly confirms the duplicate via the frontend dialog.
  const force = req.body?.force === true || req.query.force === 'true' || req.query.force === '1';
  const result = await patientService.createOldCaseVisit(
    req.params.id,
    req.body?.demographics || {},
    req.user,
    { force }
  );
  audit({
    userId: req.user.id, action: 'CREATE_VISIT', entity: 'patient_visits',
    entityId: result.visit.id,
    meta: { patientId: result.patient.id, force },
    ip: req.ip,
  });
  res.status(201).json(result);
});

exports.updateDemographics = asyncHandler(async (req, res) => {
  const patient = await patientService.updateDemographics(req.params.id, req.body);
  audit({
    userId: req.user.id, action: 'UPDATE', entity: 'patients',
    entityId: patient.id, ip: req.ip,
  });
  res.json(patient);
});

exports.remove = asyncHandler(async (req, res) => {
  await patientService.softDelete(req.params.id);
  audit({
    userId: req.user.id, action: 'DELETE', entity: 'patients',
    entityId: req.params.id, ip: req.ip,
  });
  res.status(204).end();
});
