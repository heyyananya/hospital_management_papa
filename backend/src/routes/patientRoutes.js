const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/patientController');

// All patient routes require auth.
router.use(auth);

// Admin + Receptionist can search/view/register; MO can also view.
router.get('/',          rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.search);
router.get('/:id',       rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.get);
router.get('/:id/history', rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.history);

router.post('/',                rbac('ADMIN', 'RECEPTIONIST'), c.createNew);
// Old-case "select returning patient → put into queue" is available to all 3 roles.
router.post('/:id/old-case',    rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.createOldCase);
router.put('/:id/demographics', rbac('ADMIN', 'RECEPTIONIST'), c.updateDemographics);

// Hard rule - only admin can delete.
router.delete('/:id',           rbac('ADMIN'), c.remove);

module.exports = router;
