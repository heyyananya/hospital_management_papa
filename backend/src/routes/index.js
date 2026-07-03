/**
 * Mounts every feature router under /api.
 */
const router = require('express').Router();

router.use('/auth',      require('./authRoutes'));
router.use('/users',     require('./userRoutes'));
router.use('/patients',  require('./patientRoutes'));
router.use('/visits',    require('./visitRoutes'));
router.use('/mo',        require('./moRoutes'));
router.use('/doctor',    require('./doctorRoutes'));
router.use('/masters',   require('./masterRoutes'));
router.use('/reports',   require('./reportRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/print',     require('./printRoutes'));
router.use('/billing',   require('./billingRoutes'));
router.use('/bills',     require('./billsRoutes'));
router.use('/settings',  require('./settingsRoutes'));
router.use('/reminders', require('./reminderRoutes'));
router.use('/registers', require('./registerRoutes'));
router.use('/disease-templates', require('./diseaseTemplateRoutes'));
router.use('/ipd',       require('./ipdRoutes'));

module.exports = router;
